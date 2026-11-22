import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { User } from "@supabase/supabase-js";
import type {
  AssessmentRecord,
  AssessmentReviewRecord,
  AssessmentReviewDraftRecord,
  AssessmentStatus,
  Json,
} from "../src/lib/supabase/types";
import { QUESTIONS } from "../src/data/questionnaire.js";
import {
  PILOT_ADDITIONAL_QUESTIONS,
  PILOT_TTM_QUESTIONS,
} from "../src/data/pilot-survey-questions.js";
import type { AccountRole } from "../src/features/accounts/roles.js";
import {
  calculateProfile,
  scoreResponse,
  type Answer,
} from "../src/features/assessment/scoring.js";
import {
  calculateReviewerProfile,
  getReviewerQuestionAnswers,
  summarizeReviewerProfile,
} from "../src/features/reviewer/reviewer-assessment.js";
import { getReviewerGuidanceFromProfile } from "../src/features/reviewer/reviewer-guidance.js";
import { classifyTtmStage, createTtmAnswersFromResponses } from "../src/features/pipeline/ttm.js";
import { TPB_Q1_SYNTHETIC_REFERENCE_GROUPS } from "../src/features/assessment/tpb-q1-synthetic-references.js";
import {
  generateRecipes,
  RecipeProviderError,
  RecipeRequestError,
  validateRecipeCriteria,
} from "./recipes";
import { getUsdToPhpRate } from "./exchange-rate";
import { RecipeNlgIndexUnavailableError, searchRecipeNlg } from "./recipe-nlg-index";
import { createUserClient, type UserSupabaseClient } from "./supabase";
import { runTpbQ1Experiment, TpbExperimentError } from "./tpb-q1-experiment";
import { scoreTpbAnswer, stopTpbAnswerScorer, TpbAnswerScorerError } from "./tpb-answer-scorer";
import { getTpbScoringTestResponse } from "../src/features/assessment/scoring-test-fixtures.js";

type StoredMessage = {
  id: string;
  sender: "bot" | "user";
  text: string;
};

type UserContext = {
  client: UserSupabaseClient;
  user: User;
};

const app = express();
const port = Number(process.env.PORT ?? 3001);
const localOrigins = process.env.NODE_ENV === "production"
  ? []
  : ["http://localhost:5173", "http://127.0.0.1:5173"];
const vercelOrigins = [
  process.env.VERCEL_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
]
  .filter((host): host is string => Boolean(host))
  .map((host) => `https://${host}`);
const allowedOrigins = new Set([
  ...[process.env.APP_ORIGIN, ...vercelOrigins].filter(
    (origin): origin is string => Boolean(origin),
  ),
  ...localOrigins,
]);
const root = resolve(import.meta.dirname, "..");
const consentVersion = "demo-supabase-v1";
const reviewerPageSize = 25;

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.use(express.json({ limit: "64kb", strict: true }));

function sendError(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.get("origin");
  if (!origin || !allowedOrigins.has(origin)) {
    sendError(res, 403, "This request origin is not allowed.");
    return;
  }
  next();
}

async function getUserContext(req: Request): Promise<UserContext | null> {
  const authorization = req.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const client = createUserClient(token);
  const { data, error } = await client.auth.getUser(token);
  if (error) {
    if (error.status === 401 || error.status === 403 || error.name === "AuthSessionMissingError") return null;
    throw error;
  }
  return data.user ? { client, user: data.user } : null;
}

async function requireUser(
  req: Request,
  res: Response,
  message = "Please sign in to access your assessment.",
): Promise<UserContext | null> {
  const context = await getUserContext(req);
  if (!context) sendError(res, 401, message);
  return context;
}

async function getAccountRole(context: UserContext): Promise<AccountRole> {
  const { data, error } = await context.client
    .from("profiles")
    .select("account_role")
    .eq("id", context.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data || (data.account_role !== "user" && data.account_role !== "reviewer")) {
    throw new Error("The account role is missing or invalid.");
  }
  return data.account_role;
}

async function requireReviewer(req: Request, res: Response): Promise<UserContext | null> {
  const context = await requireUser(req, res, "Please sign in to access the reviewer workspace.");
  if (!context) return null;
  if (await getAccountRole(context) !== "reviewer") {
    sendError(res, 403, "This account does not have reviewer access.");
    return null;
  }
  return context;
}

function requireString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function getErrorField(error: unknown, field: "code" | "message" | "name") {
  if (typeof error !== "object" || error === null || !(field in error)) return undefined;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

function publicErrorMessage(error: unknown) {
  switch (getErrorField(error, "code")) {
    case "42P01":
    case "PGRST205":
      return "Supabase is missing required database tables. Apply this project's migrations.";
    case "42501":
      return "Supabase denied database access. Check the project's grants and row-level security policies.";
    default:
      return "The server could not complete this request. Check the matching Vercel Function log.";
  }
}

function arrayFromJson<T>(value: Json, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Stored ${label} data is not a JSON array.`);
  return value as T[];
}

function publicAssessment(row: AssessmentRecord) {
  return {
    id: row.id,
    status: row.status,
    questionOrder: row.question_order,
    answers: arrayFromJson<Answer>(row.answers, "answer"),
    messages: arrayFromJson<StoredMessage>(row.messages, "message"),
    consentVersion: row.consent_version,
    consentAcceptedAt: row.consent_accepted_at,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

async function getOwnedAssessment(
  client: UserSupabaseClient,
  id: string,
  userId: string,
) {
  const { data, error } = await client
    .from("assessment_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function getAssessmentId(req: Request, res: Response): string | null {
  const id = req.params.id;
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  ) {
    sendError(res, 400, "The assessment ID is invalid.");
    return null;
  }
  return id;
}

function getReviewerProfile(questionOrder: string[], answers: Json) {
  return calculateReviewerProfile(questionOrder, arrayFromJson<Answer>(answers, "answer"));
}

function getReviewerProfileSummary(questionOrder: string[], answers: Json) {
  const parsedAnswers = arrayFromJson<Answer>(answers, "answer");
  const profile = summarizeReviewerProfile(getReviewerProfile(questionOrder, answers));
  if (!profile) return null;
  const ttm = classifyTtmStage(createTtmAnswersFromResponses(parsedAnswers));
  return { ...profile, stage: ttm.status === "classified" ? ttm.stage : null };
}

function getApplicableQuestionCount(questionOrder: string[], answers: readonly Answer[]) {
  const answerById = new Map(answers.map((answer) => [answer.questionId, answer]));
  return questionOrder.filter((questionId) => {
    const question = PILOT_TTM_QUESTIONS.find((item) => item.id === questionId);
    const dependency = question?.dependsOn;
    if (!dependency) return true;
    const dependencyId = `pilot-ttm-${String(dependency.questionNumber).padStart(2, "0")}`;
    const dependencyQuestion = PILOT_TTM_QUESTIONS.find((item) => item.id === dependencyId);
    if (dependencyQuestion?.dependsOn) {
      const ancestorId = `pilot-ttm-${String(dependencyQuestion.dependsOn.questionNumber).padStart(2, "0")}`;
      const ancestorResponse = answerById.get(ancestorId)?.response?.trim().toLowerCase();
      if (
        ancestorResponse !== undefined &&
        ancestorResponse !== (dependencyQuestion.dependsOn.answer ? "yes" : "no")
      ) return false;
    }
    const response = answerById.get(dependencyId)?.response?.trim().toLowerCase();
    return response === undefined || response === (dependency.answer ? "yes" : "no");
  }).length;
}

function getReviewAssignment(review: AssessmentReviewRecord | undefined, reviewerId: string) {
  if (!review) return null;
  return review.reviewer_id === reviewerId ? "you" : "another_reviewer";
}

function getReviewStatus(review: AssessmentReviewRecord | undefined) {
  return review?.status ?? "needs_review";
}

async function getReviewDrafts(client: UserSupabaseClient, assessmentId: string) {
  const { data, error } = await client
    .from("assessment_review_drafts")
    .select("*")
    .eq("assessment_id", assessmentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function publicReview(
  review: AssessmentReviewRecord,
  drafts: AssessmentReviewDraftRecord | null,
  reviewerId: string,
) {
  return {
    status: review.status,
    assignment: getReviewAssignment(review, reviewerId),
    responseDraft: drafts?.response_draft ?? "",
    recommendationDraft: drafts?.recommendation_draft ?? "",
    selectedRecipe: drafts?.selected_recipe ?? "",
    startedAt: review.started_at,
    updatedAt: review.updated_at,
    completedAt: review.completed_at,
    deliveredAt: review.delivered_at,
  };
}

app.get("/api/account/role", async (req, res, next) => {
  try {
    const context = await requireUser(req, res);
    if (!context) return;
    const role = await getAccountRole(context);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ role });
  } catch (error) {
    next(error);
  }
});

app.get("/api/reviewer/access", async (req, res, next) => {
  try {
    const context = await requireReviewer(req, res);
    if (!context) return;
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ allowed: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/reviewer/assessments", async (req, res, next) => {
  try {
    const context = await requireReviewer(req, res);
    if (!context) return;

    const pageValue = req.query.page;
    const page = pageValue === undefined ? 1 : Number(pageValue);
    if (!Number.isSafeInteger(page) || page < 1) {
      sendError(res, 400, "The reviewer queue page is invalid.");
      return;
    }

    const from = (page - 1) * reviewerPageSize;
    const to = from + reviewerPageSize - 1;
    const { data: assessments, count, error } = await context.client
      .from("assessment_sessions")
      .select("id,question_order,answers,started_at,updated_at,completed_at", { count: "exact" })
      .eq("status", "completed")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("started_at", { ascending: false })
      .range(from, to);
    if (error) throw error;

    const assessmentIds = assessments.map(({ id }) => id);
    let reviews: AssessmentReviewRecord[] = [];
    if (assessmentIds.length > 0) {
      const { data, error: reviewError } = await context.client
        .from("assessment_reviews")
        .select("assessment_id,reviewer_id,status,started_at,updated_at,completed_at,delivered_at")
        .in("assessment_id", assessmentIds);
      if (reviewError) throw reviewError;
      reviews = data;
    }
    const reviewByAssessment = new Map(reviews.map((review) => [review.assessment_id, review]));

    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      assessments: assessments.map((assessment) => {
        const review = reviewByAssessment.get(assessment.id);
        const answers = arrayFromJson<Answer>(assessment.answers, "answer");
        return {
          id: assessment.id,
          submittedAt: assessment.completed_at ?? assessment.updated_at,
          answered: answers.length,
          total: getApplicableQuestionCount(assessment.question_order, answers),
          reviewStatus: getReviewStatus(review),
          assignment: getReviewAssignment(review, context.user.id),
          profile: getReviewerProfileSummary(assessment.question_order, assessment.answers),
        };
      }),
      page,
      pageSize: reviewerPageSize,
      total: count ?? assessments.length,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/reviewer/assessments/:id", async (req, res, next) => {
  try {
    const context = await requireReviewer(req, res);
    if (!context) return;
    const id = getAssessmentId(req, res);
    if (!id) return;

    const { data: assessment, error } = await context.client
      .from("assessment_sessions")
      .select("id,status,question_order,answers,messages,started_at,updated_at,completed_at")
      .eq("id", id)
      .eq("status", "completed")
      .maybeSingle();
    if (error) throw error;
    if (!assessment) {
      sendError(res, 404, "Completed assessment not found.");
      return;
    }

    const { data: review, error: reviewError } = await context.client
      .from("assessment_reviews")
      .select("assessment_id,reviewer_id,status,started_at,updated_at,completed_at,delivered_at")
      .eq("assessment_id", id)
      .maybeSingle();
    if (reviewError) throw reviewError;
    const answers = arrayFromJson<Answer>(assessment.answers, "answer");
    const canReadReviewDraft = review?.status === "completed" || review?.reviewer_id === context.user.id;
    const drafts = review && canReadReviewDraft
      ? await getReviewDrafts(context.client, id)
      : null;
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      assessment: {
        id: assessment.id,
        submittedAt: assessment.completed_at ?? assessment.updated_at,
        answered: answers.length,
        total: getApplicableQuestionCount(assessment.question_order, answers),
        messages: arrayFromJson<StoredMessage>(assessment.messages, "message"),
        questionAnswers: getReviewerQuestionAnswers(assessment.question_order, answers),
        profile: getReviewerProfileSummary(assessment.question_order, assessment.answers),
      },
      review: review
        ? {
            status: review.status,
            assignment: getReviewAssignment(review, context.user.id),
            ...(canReadReviewDraft
              ? {
                  responseDraft: drafts?.response_draft ?? "",
                  recommendationDraft: drafts?.recommendation_draft ?? "",
                  selectedRecipe: drafts?.selected_recipe ?? "",
                }
              : {}),
            updatedAt: review.updated_at,
            completedAt: review.completed_at,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/reviewer/assessments/:id/start", requireSameOrigin, async (req, res, next) => {
  try {
    const context = await requireReviewer(req, res);
    if (!context) return;
    const id = getAssessmentId(req, res);
    if (!id) return;

    const { data: assessment, error: assessmentError } = await context.client
      .from("assessment_sessions")
      .select("id,question_order,answers")
      .eq("id", id)
      .eq("status", "completed")
      .maybeSingle();
    if (assessmentError) throw assessmentError;
    if (!assessment) {
      sendError(res, 404, "Completed assessment not found.");
      return;
    }

    const { data: existing, error: existingError } = await context.client
      .from("assessment_reviews")
      .select("assessment_id,reviewer_id,status,started_at,updated_at,completed_at,delivered_at")
      .eq("assessment_id", id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (existing.reviewer_id !== context.user.id || existing.status === "completed") {
        sendError(res, 409, "This assessment is not available to claim.");
        return;
      }
      const drafts = await getReviewDrafts(context.client, id);
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ review: publicReview(existing, drafts, context.user.id) });
      return;
    }

    const profile = getReviewerProfile(assessment.question_order, assessment.answers);
    const guidance = profile ? getReviewerGuidanceFromProfile(profile) : null;
    const { data: review, error: insertError } = await context.client
      .from("assessment_reviews")
      .insert({
        assessment_id: id,
        reviewer_id: context.user.id,
        status: "in_progress",
      })
      .select("assessment_id,reviewer_id,status,started_at,updated_at,completed_at,delivered_at")
      .maybeSingle();
    if (insertError?.code === "23505") {
      const { data: claimed, error: claimedError } = await context.client
        .from("assessment_reviews")
        .select("assessment_id,reviewer_id,status,started_at,updated_at,completed_at,delivered_at")
        .eq("assessment_id", id)
        .maybeSingle();
      if (claimedError) throw claimedError;
      if (claimed?.reviewer_id === context.user.id && claimed.status === "in_progress") {
        const drafts = await getReviewDrafts(context.client, id);
        res.setHeader("Cache-Control", "private, no-store");
        res.json({ review: publicReview(claimed, drafts, context.user.id) });
        return;
      }
      sendError(res, 409, "Another reviewer claimed this assessment. Refresh the queue to see its status.");
      return;
    }
    if (insertError) throw insertError;
    if (!review) {
      sendError(res, 409, "This assessment could not be claimed. Refresh the queue and try again.");
      return;
    }

    const { data: drafts, error: draftError } = await context.client
      .from("assessment_review_drafts")
      .insert({
        assessment_id: id,
        response_draft: guidance?.response ?? "",
        recommendation_draft: guidance?.recommendation ?? "",
      })
      .select("*")
      .maybeSingle();
    if (draftError) throw draftError;
    if (!drafts) throw new Error("The reviewer draft could not be initialized.");

    res.setHeader("Cache-Control", "private, no-store");
    res.status(201).json({ review: publicReview(review, drafts, context.user.id) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/reviewer/assessments/:id/draft", requireSameOrigin, async (req, res, next) => {
  try {
    const context = await requireReviewer(req, res);
    if (!context) return;
    const id = getAssessmentId(req, res);
    if (!id) return;

    const { responseDraft, recommendationDraft, selectedRecipe } = req.body ?? {};
    if (
      typeof responseDraft !== "string" ||
      responseDraft.length > 5000 ||
      typeof recommendationDraft !== "string" ||
      recommendationDraft.length > 5000 ||
      typeof selectedRecipe !== "string" ||
      selectedRecipe.length > 5000
    ) {
      sendError(res, 400, "The review draft is invalid.");
      return;
    }

    const { data: current, error: currentError } = await context.client
      .from("assessment_reviews")
      .select("assessment_id,reviewer_id,status,started_at,updated_at,completed_at,delivered_at")
      .eq("assessment_id", id)
      .eq("reviewer_id", context.user.id)
      .eq("status", "in_progress")
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) {
      sendError(res, 409, "This review is not assigned to you or is already complete.");
      return;
    }

    const { data: drafts, error: draftError } = await context.client
      .from("assessment_review_drafts")
      .upsert(
        {
          assessment_id: id,
          response_draft: responseDraft,
          recommendation_draft: recommendationDraft,
          selected_recipe: selectedRecipe,
        },
        { onConflict: "assessment_id" },
      )
      .select("*")
      .maybeSingle();
    if (draftError) throw draftError;
    if (!drafts) throw new Error("The reviewer draft could not be saved.");

    const updatedAt = new Date().toISOString();
    const { data: review, error } = await context.client
      .from("assessment_reviews")
      .update({ updated_at: updatedAt })
      .eq("assessment_id", id)
      .eq("reviewer_id", context.user.id)
      .eq("status", "in_progress")
      .select("assessment_id,reviewer_id,status,started_at,updated_at,completed_at,delivered_at")
      .maybeSingle();
    if (error) throw error;
    if (!review) {
      sendError(res, 409, "This review changed before the draft could be saved. Refresh and try again.");
      return;
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.json({ review: publicReview(review, drafts, context.user.id) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/reviewer/assessments/:id/complete", requireSameOrigin, async (req, res, next) => {
  try {
    const context = await requireReviewer(req, res);
    if (!context) return;
    const id = getAssessmentId(req, res);
    if (!id) return;

    const { data: current, error: currentError } = await context.client
      .from("assessment_reviews")
      .select("assessment_id,reviewer_id,status,started_at,updated_at,completed_at,delivered_at")
      .eq("assessment_id", id)
      .eq("reviewer_id", context.user.id)
      .eq("status", "in_progress")
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) {
      sendError(res, 409, "This review is not assigned to you or is already complete.");
      return;
    }
    const drafts = await getReviewDrafts(context.client, id);
    if (!drafts?.response_draft.trim() || !drafts.recommendation_draft.trim()) {
      sendError(res, 400, "Add a participant response and recommendation before completing the review.");
      return;
    }

    const completedAt = new Date().toISOString();
    const { data: review, error } = await context.client
      .from("assessment_reviews")
      .update({
        status: "completed",
        completed_at: completedAt,
        updated_at: completedAt,
        delivered_at: completedAt,
      })
      .eq("assessment_id", id)
      .eq("reviewer_id", context.user.id)
      .eq("status", "in_progress")
      .select("assessment_id,reviewer_id,status,started_at,updated_at,completed_at,delivered_at")
      .maybeSingle();
    if (error) throw error;
    if (!review) {
      sendError(res, 409, "This review changed before it could be completed. Refresh and try again.");
      return;
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.json({ review: publicReview(review, drafts, context.user.id) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", storage: "supabase" });
});

app.get("/api/reviewer/recipes", async (req, res, next) => {
  try {
    const sampleMode = process.env.NODE_ENV !== "production" && req.query.sample === "true";
    if (!sampleMode) {
      const context = await requireReviewer(req, res);
      if (!context) return;
    }

    const query = req.query.q;
    if (typeof query !== "string" || query.trim().length < 2 || query.length > 80) {
      sendError(res, 400, "Search for a recipe or ingredient using 2–80 characters.");
      return;
    }

    const source = req.query.source;
    if (
      source !== undefined &&
      source !== "Gathered" &&
      source !== "Recipes1M"
    ) {
      sendError(res, 400, "Choose a supported recipe collection.");
      return;
    }
    const excludeIngredients = req.query.exclude;
    if (
      excludeIngredients !== undefined &&
      (typeof excludeIngredients !== "string" || excludeIngredients.length > 160)
    ) {
      sendError(res, 400, "Excluded ingredients must be 160 characters or fewer.");
      return;
    }

    try {
      const results = searchRecipeNlg(query.trim(), 21, undefined, {
        source,
        excludeIngredients: typeof excludeIngredients === "string" ? excludeIngredients : "",
      });
      res.setHeader("Cache-Control", "private, no-store");
      res.json({
        recipes: results.slice(0, 20),
        hasMore: results.length > 20,
      });
    } catch (error) {
      if (error instanceof RecipeNlgIndexUnavailableError) {
        sendError(res, 503, error.message);
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

app.post("/api/tpb/q1-experiment", requireSameOrigin, async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production") {
      sendError(res, 404, "The TPB experiment is only available in local development.");
      return;
    }
    const context = await requireUser(req, res, "Please sign in to run the TPB experiment.");
    if (!context) return;

    const response = req.body?.response;
    if (typeof response !== "string" || !response.trim() || response.length > 2000) {
      sendError(res, 400, "Enter a Q1 response of 1–2000 characters.");
      return;
    }

    try {
      const result = await runTpbQ1Experiment({
        response: response.trim(),
        groups: TPB_Q1_SYNTHETIC_REFERENCE_GROUPS,
      });
      res.setHeader("Cache-Control", "private, no-store");
      res.json(result);
    } catch (error) {
      if (error instanceof TpbExperimentError) {
        sendError(res, error.status, error.message);
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

app.post("/api/dev/tpb-scoring-test", requireSameOrigin, async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production" || !localOrigins.includes(req.get("origin") ?? "")) {
      sendError(res, 404, "The automated TPB scoring test is only available in local development.");
      return;
    }
    const context = await requireUser(req, res, "Please sign in to run the automated scoring test.");
    if (!context) return;

    const questionOrder = req.body?.questionOrder;
    const questionById = new Map(QUESTIONS.map((question) => [question.id, question]));
    const ttmQuestionById = new Map(PILOT_TTM_QUESTIONS.map((question) => [question.id, question]));
    const additionalQuestionById = new Map(PILOT_ADDITIONAL_QUESTIONS.map((question) => [question.id, question]));
    const allQuestionIds = new Set([
      ...questionById.keys(),
      ...ttmQuestionById.keys(),
      ...additionalQuestionById.keys(),
    ]);
    const validQuestionOrder =
      Array.isArray(questionOrder) &&
      questionOrder.length === allQuestionIds.size &&
      questionOrder.every((id) => typeof id === "string" && allQuestionIds.has(id)) &&
      new Set(questionOrder).size === allQuestionIds.size;
    if (!validQuestionOrder) {
      sendError(res, 400, "The automated scoring test question order is invalid.");
      return;
    }

    const answers: Answer[] = [];
    let tpbScored = 0;
    let intentionScored = 0;

    for (const questionId of questionOrder) {
      const question = questionById.get(questionId);
      if (question) {
        const response = getTpbScoringTestResponse(question);
        if (question.construct === "intention") {
          const score = scoreResponse(question, response);
          if (score !== null) intentionScored += 1;
          answers.push({ questionId: question.id, response, score });
        } else {
          const tpbModelRating = await scoreTpbAnswer(question.prompt, response);
          tpbScored += 1;
          answers.push({ questionId: question.id, response, score: null, tpbModelRating });
        }
        continue;
      }

      if (questionId === "pilot-ttm-64") continue;
      const syntheticResponse: Record<string, string> = {
        "pilot-ttm-63": "No",
        "pilot-ttm-65": "Yes",
        "pilot-ttm-66": "No",
        "pilot-additional-67": "24",
        "pilot-additional-68": "Somewhat reliable (occasional issues)",
        "pilot-additional-69": "No",
        "pilot-additional-70": "None",
        "pilot-additional-71": "Full kitchen",
        "pilot-additional-72": "2–3 times per week",
      };
      if (!ttmQuestionById.has(questionId) && !additionalQuestionById.has(questionId)) {
        throw new Error("The automated test returned an unknown question.");
      }
      const response = syntheticResponse[questionId];
      if (!response) throw new Error("The automated test is missing a synthetic response.");
      answers.push({ questionId, response, score: null });
    }

    const now = new Date().toISOString();
    const messages: StoredMessage[] = [
      {
        id: randomUUID(),
        sender: "bot",
        text: "This is a synthetic automated test. Its answers and scores have been submitted for human review.",
      },
    ];
    const submittedQuestionOrder = answers.map((answer) => answer.questionId);
    for (const questionId of submittedQuestionOrder) {
      const answer = answers.find((item) => item.questionId === questionId);
      const question = questionById.get(questionId)
        ?? ttmQuestionById.get(questionId)
        ?? additionalQuestionById.get(questionId);
      if (!answer || !question) throw new Error("The automated test returned an unknown question.");
      messages.push(
        { id: randomUUID(), sender: "bot", text: question.prompt },
        { id: randomUUID(), sender: "user", text: answer.response ?? "Prefer not to answer" },
      );
    }
    messages.push({
      id: randomUUID(),
      sender: "bot",
      text: "The automated run is complete and saved in the reviewer queue.",
    });

    const { data: submitted, error: submitError } = await context.client
      .from("assessment_sessions")
      .insert({
        user_id: context.user.id,
        status: "completed",
        question_order: questionOrder,
        answers: answers as Json,
        messages: messages as Json,
        consent_version: "automated-test-v1",
        consent_accepted_at: now,
        started_at: now,
        updated_at: now,
        completed_at: now,
      })
      .select("id")
      .single();
    if (submitError) throw submitError;

    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      assessmentId: submitted.id,
      answers,
      profile: calculateProfile(QUESTIONS, answers),
      questionOrder: submittedQuestionOrder,
      counts: {
        tpbScored,
        tpbTotal: QUESTIONS.filter((question) => question.construct !== "intention").length,
        intentionScored,
        intentionTotal: QUESTIONS.filter((question) => question.construct === "intention").length,
      },
    });
  } catch (error) {
    if (error instanceof TpbAnswerScorerError) {
      sendError(res, error.status, error.message);
      return;
    }
    next(error);
  }
});

app.post("/api/recipes/generate", requireSameOrigin, async (req, res, next) => {
  try {
    const context = await requireUser(req, res, "Please sign in to generate recipes.");
    if (!context) return;

    try {
      const criteria = validateRecipeCriteria(req.body?.criteria);
      const exchangeRatePromise = getUsdToPhpRate();
      const recipesPromise = exchangeRatePromise.then(
        (exchangeRate) => generateRecipes(criteria, undefined, fetch, exchangeRate.usdToPhp),
      );
      const [exchangeRate, recipes] = await Promise.all([exchangeRatePromise, recipesPromise]);
      res.setHeader("Cache-Control", "private, no-store");
      res.json({
        recipes,
        candidateCount: recipes.length,
        exchangeRate,
        provider: "spoonacular",
        note: `Time, servings, budget, and effort are checked against returned recipe details. The PHP cost is Spoonacular’s USD estimate converted at ₱${exchangeRate.usdToPhp.toFixed(2)} per US$1 (${exchangeRate.source}, ${exchangeRate.date}); it is not a local Philippine market price.${exchangeRate.source === "fallback" ? " The live exchange-rate service was unavailable, so the configured fallback rate was used." : ""} Effort is a time-and-step-count heuristic; ingredient matches do not guarantee local availability. Dietary and allergy filters are not a safety guarantee. Spoonacular cuisine tagging may not cover Filipino dishes, so search by dish name.`,
      });
    } catch (error) {
      if (error instanceof RecipeRequestError) {
        sendError(res, 400, error.message);
        return;
      }
      if (error instanceof RecipeProviderError) {
        sendError(res, error.status, error.message);
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

app.get("/api/assessments/active", async (req, res, next) => {
  try {
    const context = await requireUser(req, res);
    if (!context) return;
    const { client, user } = context;
    const { data: active, error: activeError } = await client
      .from("assessment_sessions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "in_progress")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeError) throw activeError;

    let row = active;
    if (
      row &&
      row.question_order.length === QUESTIONS.length &&
      row.question_order.every((questionId) => QUESTIONS.some((question) => question.id === questionId))
    ) {
      const questionOrder = [
        ...row.question_order,
        ...PILOT_TTM_QUESTIONS.map((question) => question.id),
        ...PILOT_ADDITIONAL_QUESTIONS.map((question) => question.id),
      ];
      const { data: upgraded, error: upgradeError } = await client
        .from("assessment_sessions")
        .update({ question_order: questionOrder, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("user_id", user.id)
        .eq("status", "in_progress")
        .eq("updated_at", row.updated_at)
        .select("*")
        .maybeSingle();
      if (upgradeError) throw upgradeError;
      if (!upgraded) {
        throw new Error("The assessment changed while it was being upgraded. Refresh and try again.");
      }
      row = upgraded;
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.json({ assessment: row ? publicAssessment(row) : null });
  } catch (error) {
    next(error);
  }
});

app.get("/api/assessments", async (req, res, next) => {
  try {
    const context = await requireUser(req, res);
    if (!context) return;
    const { data, error } = await context.client
      .from("assessment_sessions")
    .select("id,status,question_order,answers,consent_version,started_at,updated_at,completed_at")
      .eq("user_id", context.user.id)
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const assessmentIds = data.map(({ id }) => id);
    const deliveredReviewsByAssessment = new Map<string, {
      deliveredAt: string;
      response: string;
      recommendation: string;
      recipe: string;
    }>();
    if (assessmentIds.length > 0) {
      const { data: reviews, error: reviewsError } = await context.client
        .from("assessment_reviews")
        .select("assessment_id,delivered_at")
        .in("assessment_id", assessmentIds)
        .not("delivered_at", "is", null);
      if (reviewsError) throw reviewsError;

      const deliveredIds = reviews.map((review) => review.assessment_id);
      if (deliveredIds.length > 0) {
        const { data: drafts, error: draftsError } = await context.client
          .from("assessment_review_drafts")
          .select("assessment_id,response_draft,recommendation_draft,selected_recipe")
          .in("assessment_id", deliveredIds);
        if (draftsError) throw draftsError;

        const draftsByAssessment = new Map(drafts.map((draft) => [draft.assessment_id, draft]));
        for (const review of reviews) {
          const draft = draftsByAssessment.get(review.assessment_id);
          if (!review.delivered_at || !draft) {
            throw new Error("A delivered assessment response is missing its review draft.");
          }
          deliveredReviewsByAssessment.set(review.assessment_id, {
            deliveredAt: review.delivered_at,
            response: draft.response_draft,
            recommendation: draft.recommendation_draft,
            recipe: draft.selected_recipe,
          });
        }
      }
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      assessments: data.map((row) => ({
        id: row.id,
        status: row.status,
        answered: arrayFromJson<Answer>(row.answers, "answer").length,
        total: getApplicableQuestionCount(row.question_order, arrayFromJson<Answer>(row.answers, "answer")),
        consentVersion: row.consent_version,
        startedAt: row.started_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
        reviewDelivery: deliveredReviewsByAssessment.get(row.id) ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/assessments/:id", async (req, res, next) => {
  try {
    const context = await requireUser(req, res);
    if (!context) return;
    const id = getAssessmentId(req, res);
    if (!id) return;
    const row = await getOwnedAssessment(context.client, id, context.user.id);
    if (!row) {
      sendError(res, 404, "Assessment not found.");
      return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ assessment: publicAssessment(row) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/assessments", requireSameOrigin, async (req, res, next) => {
  try {
    const context = await requireUser(req, res);
    if (!context) return;
    const { client, user } = context;
    if (req.body?.consent !== true || req.body?.consentVersion !== consentVersion) {
      sendError(res, 400, "Please accept the current data-storage consent before continuing.");
      return;
    }

    const submittedQuestionOrder = req.body?.questionOrder;
    const tpbQuestionIds = new Set(QUESTIONS.map((question) => question.id));
    const knownQuestionIds = new Set([
      ...tpbQuestionIds,
      ...PILOT_TTM_QUESTIONS.map((question) => question.id),
      ...PILOT_ADDITIONAL_QUESTIONS.map((question) => question.id),
    ]);
    const hasUniqueKnownIds =
      Array.isArray(submittedQuestionOrder) &&
      submittedQuestionOrder.every((id: unknown) => typeof id === "string" && knownQuestionIds.has(id)) &&
      new Set(submittedQuestionOrder).size === submittedQuestionOrder.length;
    const isFullQuestionOrder = hasUniqueKnownIds
      && submittedQuestionOrder.length === knownQuestionIds.size
      && [...knownQuestionIds].every((id) => submittedQuestionOrder.includes(id));
    const isLegacyTpbOrder = hasUniqueKnownIds
      && submittedQuestionOrder.length === tpbQuestionIds.size
      && [...tpbQuestionIds].every((id) => submittedQuestionOrder.includes(id));
    const questionOrder = isFullQuestionOrder
      ? submittedQuestionOrder
      : isLegacyTpbOrder
        ? [
            ...submittedQuestionOrder,
            ...PILOT_TTM_QUESTIONS.map((question) => question.id),
            ...PILOT_ADDITIONAL_QUESTIONS.map((question) => question.id),
          ]
        : null;
    if (!questionOrder) {
      sendError(res, 400, `The assessment must include all ${knownQuestionIds.size} questions, or the ${tpbQuestionIds.size} reflection questions for compatibility.`);
      return;
    }

    const { data: existing, error: existingError } = await client
      .from("assessment_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "in_progress")
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      sendError(res, 409, "You already have an assessment in progress. Resume it instead.");
      return;
    }

    const greeting: StoredMessage = {
      id: randomUUID(),
      sender: "bot",
      text: `Hi there, I’m AliMind. I’m here to help you reflect on your eating habits—without judgment or pressure. The full assessment pool has ${knownQuestionIds.size} questions. You’ll answer 70 or 71 in total, depending on your Yes/No stage-of-change answers. It includes open-ended reflections and choice-based questions. There are no right or wrong answers.`,
    };
    const { data, error } = await client
      .from("assessment_sessions")
      .insert({
        user_id: user.id,
        status: "in_progress",
        question_order: questionOrder,
        answers: [] as Json,
        messages: [greeting] as Json,
        consent_version: consentVersion,
        consent_accepted_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error?.code === "23505") {
      sendError(res, 409, "You already have an assessment in progress. Resume it instead.");
      return;
    }
    if (error?.code === "23514" && error.message.includes("assessment_sessions_question_order_check")) {
      sendError(res, 503, "The database needs the live assessment migration. Apply 202611200001_live_ttm_additional_questions.sql and try again.");
      return;
    }
    if (error) throw error;

    res.setHeader("Cache-Control", "private, no-store");
    res.status(201).json({ assessment: publicAssessment(data) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/assessments/:id/answers", requireSameOrigin, async (req, res, next) => {
  try {
    const context = await requireUser(req, res);
    if (!context) return;
    const { client, user } = context;
    const id = getAssessmentId(req, res);
    if (!id) return;
    const row = await getOwnedAssessment(client, id, user.id);
    if (!row) {
      sendError(res, 404, "Assessment not found.");
      return;
    }
    if (row.status !== "in_progress") {
      sendError(res, 409, "This assessment is not accepting answers.");
      return;
    }

    const answers = arrayFromJson<Answer>(row.answers, "answer");
    const { questionId, response } = req.body ?? {};
    if (
      typeof questionId !== "string" ||
      response !== null && (!requireString(response, 1000) || response.trim().length === 0)
    ) {
      sendError(res, 400, "The assessment answer is invalid.");
      return;
    }
    if (!row.question_order.includes(questionId)) {
      sendError(res, 400, "The assessment question is invalid.");
      return;
    }
    const ttmQuestion = PILOT_TTM_QUESTIONS.find((item) => item.id === questionId);
    if (ttmQuestion && response !== "Yes" && response !== "No") {
      sendError(res, 400, "Stage-of-change answers must be Yes or No.");
      return;
    }
    const additionalQuestion = PILOT_ADDITIONAL_QUESTIONS.find((item) => item.id === questionId);
    if (additionalQuestion) {
      const validAdditionalResponse = additionalQuestion.type === "number"
        ? typeof response === "string" && /^\d{1,3}$/.test(response) && Number(response) >= 1 && Number(response) <= 120
        : additionalQuestion.type === "singleSelect"
          ? typeof response === "string" && additionalQuestion.options?.includes(response) === true
          : additionalQuestion.type === "multiSelect" && typeof response === "string"
            ? (() => {
                const selectedOptions = response.split(" | ");
                return selectedOptions.length > 0
                  && selectedOptions.every((option) => additionalQuestion.options?.includes(option) === true)
                  && new Set(selectedOptions).size === selectedOptions.length
                  && (!selectedOptions.includes("None") || selectedOptions.length === 1);
              })()
            : false;
      if (!validAdditionalResponse) {
        sendError(res, 400, "Choose a valid response from the available additional-question options.");
        return;
      }
    }
    const previousAnswer = answers.find((answer) => answer.questionId === questionId);
    if (previousAnswer) {
      if (previousAnswer.response !== response) {
        sendError(res, 409, "That question has already been answered differently.");
        return;
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ assessment: publicAssessment(row) });
      return;
    }

    if (ttmQuestion?.dependsOn) {
      const dependencyAnswer = answers.find((answer) =>
        answer.questionId === `pilot-ttm-${String(ttmQuestion.dependsOn?.questionNumber).padStart(2, "0")}`,
      );
      const dependencyMatches = dependencyAnswer?.response?.trim().toLowerCase()
        === (ttmQuestion.dependsOn.answer ? "yes" : "no");
      if (!dependencyMatches) {
        sendError(res, 409, "That stage-of-change question is not applicable to your prior answer.");
        return;
      }
    }

    const question = QUESTIONS.find((item) => item.id === questionId);
    let score: Answer["score"] = null;
    let tpbModelRating: number | null = null;
    if (question) {
      score = response === null || question.construct !== "intention"
        ? null
        : scoreResponse(question, response);
      tpbModelRating = response !== null && question.construct !== "intention"
        ? await scoreTpbAnswer(question.prompt, response)
        : null;
    }
    const answer: Answer = {
      questionId,
      response,
      score,
      ...(question && question.construct !== "intention" ? { tpbModelRating } : {}),
    };
    const nextAnswers = [...answers, answer];
    const messages = arrayFromJson<StoredMessage>(row.messages, "message");
    const nextMessages: StoredMessage[] = [
      ...messages,
      { id: randomUUID(), sender: "user", text: response ?? "Prefer not to answer" },
    ];
    const { data, error } = await client
      .from("assessment_sessions")
      .update({
        answers: nextAnswers as Json,
        messages: nextMessages as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("user_id", user.id)
      .eq("status", "in_progress")
      .eq("updated_at", row.updated_at)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      sendError(res, 409, "This assessment changed in another request. Refresh and try again.");
      return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ assessment: publicAssessment(data) });
  } catch (error) {
    if (error instanceof TpbAnswerScorerError) {
      sendError(res, error.status, error.message);
      return;
    }
    next(error);
  }
});

app.post("/api/assessments/:id/abandon", requireSameOrigin, async (req, res, next) => {
  try {
    const context = await requireUser(req, res);
    if (!context) return;
    const id = getAssessmentId(req, res);
    if (!id) return;
    const row = await getOwnedAssessment(context.client, id, context.user.id);
    if (!row) {
      sendError(res, 404, "Assessment not found.");
      return;
    }
    if (row.status !== "in_progress") {
      sendError(res, 409, "Only an in-progress assessment can be abandoned.");
      return;
    }

    const { data, error } = await context.client
      .from("assessment_sessions")
      .update({ status: "abandoned", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("user_id", context.user.id)
      .eq("status", "in_progress")
      .eq("updated_at", row.updated_at)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      sendError(res, 409, "This assessment changed in another request. Refresh and try again.");
      return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/assessments/:id/messages", requireSameOrigin, async (req, res, next) => {
  try {
    const context = await requireUser(req, res);
    if (!context) return;
    const { client, user } = context;
    const id = getAssessmentId(req, res);
    if (!id) return;
    const row = await getOwnedAssessment(client, id, user.id);
    if (!row) {
      sendError(res, 404, "Assessment not found.");
      return;
    }

    const { sender, text, completed, messageId } = req.body ?? {};
    if (
      !["bot", "user"].includes(sender) ||
      !requireString(text, 2000) ||
      typeof messageId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)
    ) {
      sendError(res, 400, "The chat message is invalid.");
      return;
    }

    const messages = arrayFromJson<StoredMessage>(row.messages, "message");
    const existing = messages.find((message) => message.id === messageId);
    if (existing) {
      if (existing.sender !== sender || existing.text !== text) {
        sendError(res, 409, "That message ID has already been used for different content.");
        return;
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ assessment: publicAssessment(row) });
      return;
    }

    const answers = arrayFromJson<Answer>(row.answers, "answer");
    if (row.status === "abandoned" || row.status === "completed" && completed === true) {
      sendError(res, 409, "This assessment cannot accept that chat message.");
      return;
    }
    if (sender === "user" && row.status !== "completed") {
      sendError(res, 409, "Submit the current assessment answer before continuing.");
      return;
    }
    if (completed === true && sender !== "bot") {
      sendError(res, 409, "Only a bot completion message can complete an assessment.");
      return;
    }
    if (completed === true) {
      const answerById = new Map(answers.map((answer) => [answer.questionId, answer]));
      const unansweredQuestion = row.question_order.some((questionId) => {
        const conditional = PILOT_TTM_QUESTIONS.find((item) => item.id === questionId)?.dependsOn;
        if (conditional) {
          const dependencyId = `pilot-ttm-${String(conditional.questionNumber).padStart(2, "0")}`;
          const dependencyAnswer = answerById.get(dependencyId)?.response?.trim().toLowerCase();
          if (dependencyAnswer !== (conditional.answer ? "yes" : "no")) return false;
        }
        return !answerById.has(questionId);
      });
      if (unansweredQuestion) {
        sendError(res, 409, "Answer all required questions before completing the assessment.");
        return;
      }
    }
    if (row.status === "completed" && sender !== "user") {
      sendError(res, 409, "Only follow-up user messages are accepted after completion.");
      return;
    }

    const nextMessages: StoredMessage[] = [...messages, { id: messageId, sender, text }];
    const now = new Date().toISOString();
    const status: AssessmentStatus = completed === true ? "completed" : row.status;
    const { data, error } = await client
      .from("assessment_sessions")
      .update({
        messages: nextMessages as Json,
        status,
        updated_at: now,
        ...(completed === true ? { completed_at: now } : {}),
      })
      .eq("id", row.id)
      .eq("user_id", user.id)
      .eq("status", row.status)
      .eq("updated_at", row.updated_at)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      sendError(res, 409, "This assessment changed in another request. Refresh and try again.");
      return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ assessment: publicAssessment(data) });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (req, res) => {
  sendError(res, 404, `No API route matches ${req.method} ${req.path}.`);
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve(root, "dist"), { index: false, maxAge: "1h" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(resolve(root, "dist/index.html"));
  });
}

app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  const requestId = randomUUID();
  console.error("API request failed", JSON.stringify({
    requestId,
    method: req.method,
    route: req.route?.path ?? "unmatched",
    name: getErrorField(error, "name") ?? "UnknownError",
    code: getErrorField(error, "code"),
    message: getErrorField(error, "message") ?? String(error),
  }));
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(500).json({ error: publicErrorMessage(error), requestId });
});

export default app;

if (process.env.VERCEL !== "1") {
  const server = app.listen(port, () => {
    console.info(`AliMind API listening on http://localhost:${port}; Supabase: ${process.env.VITE_SUPABASE_URL}`);
  });

  function closeServer() {
    stopTpbAnswerScorer();
    server.close(() => process.exit(0));
  }

  process.on("SIGINT", closeServer);
  process.on("SIGTERM", closeServer);
}
