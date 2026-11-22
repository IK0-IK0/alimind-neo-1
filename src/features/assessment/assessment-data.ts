import { getSupabaseClient } from "../../auth/client";
import { QUESTIONS } from "../../data/questionnaire";
import {
  PILOT_ADDITIONAL_QUESTIONS,
  PILOT_TTM_QUESTIONS,
} from "../../data/pilot-survey-questions";
import { arrayFromJson } from "../../lib/supabase/json";
import type { AssessmentRecord } from "../../lib/supabase/types";
import { getApplicableQuestionCount } from "./assessment-progress";
import type { Answer } from "./scoring";

type StoredMessage = { id: string; sender: "bot" | "user"; text: string };

export type AssessmentSummary = {
  id: string;
  status: AssessmentRecord["status"];
  answered: number;
  total: number;
  consentVersion: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  reviewDelivery: {
    deliveredAt: string;
    response: string;
    recommendation: string;
    recipe: string;
  } | null;
};

export type AssessmentSessionDetail = {
  id: string;
  status: AssessmentRecord["status"];
  questionOrder: string[];
  answers: Answer[];
  messages: StoredMessage[];
  startedAt: string;
  completedAt: string | null;
};

export type ActiveAssessment = {
  id: string;
  questionOrder: string[];
  answers: Answer[];
  messages: StoredMessage[];
  status: "in_progress";
};

export const ASSESSMENT_CONSENT_VERSION = "demo-supabase-v1";

function mapAssessment(row: AssessmentRecord): ActiveAssessment {
  return {
    id: row.id,
    status: "in_progress",
    questionOrder: row.question_order,
    answers: arrayFromJson<Answer>(row.answers, "answer"),
    messages: arrayFromJson<StoredMessage>(row.messages, "message"),
  };
}

export async function createAssessment(
  userId: string,
  questionOrder: string[],
): Promise<ActiveAssessment> {
  const tpbQuestionIds = new Set(QUESTIONS.map((question) => question.id));
  const knownQuestionIds = new Set([
    ...tpbQuestionIds,
    ...PILOT_TTM_QUESTIONS.map((question) => question.id),
    ...PILOT_ADDITIONAL_QUESTIONS.map((question) => question.id),
  ]);
  const hasUniqueKnownIds = questionOrder.every((id) => knownQuestionIds.has(id))
    && new Set(questionOrder).size === questionOrder.length;
  const isFullQuestionOrder = hasUniqueKnownIds
    && questionOrder.length === knownQuestionIds.size
    && [...knownQuestionIds].every((id) => questionOrder.includes(id));
  const isLegacyTpbOrder = hasUniqueKnownIds
    && questionOrder.length === tpbQuestionIds.size
    && [...tpbQuestionIds].every((id) => questionOrder.includes(id));
  if (!isFullQuestionOrder && !isLegacyTpbOrder) {
    throw new Error(
      `The assessment must include all ${knownQuestionIds.size} questions, or the ${tpbQuestionIds.size} reflection questions for compatibility.`,
    );
  }
  const savedQuestionOrder = isFullQuestionOrder
    ? questionOrder
    : [
        ...questionOrder,
        ...PILOT_TTM_QUESTIONS.map((question) => question.id),
        ...PILOT_ADDITIONAL_QUESTIONS.map((question) => question.id),
      ];

  const client = getSupabaseClient();
  const { data: existing, error: existingError } = await client
    .from("assessment_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    throw new Error("You already have an assessment in progress. Resume it instead.");
  }

  const greeting: StoredMessage = {
    id: crypto.randomUUID(),
    sender: "bot",
    text: `Hi there, I’m AliMind. I’m here to help you reflect on your eating habits—without judgment or pressure. The full assessment pool has ${knownQuestionIds.size} questions. You’ll answer 70 or 71 in total, depending on your Yes/No stage-of-change answers. It includes open-ended reflections and choice-based questions. There are no right or wrong answers.`,
  };
  const { data, error } = await client
    .from("assessment_sessions")
    .insert({
      user_id: userId,
      status: "in_progress",
      question_order: savedQuestionOrder,
      answers: [],
      messages: [greeting],
      consent_version: ASSESSMENT_CONSENT_VERSION,
      consent_accepted_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error?.code === "23505") {
    throw new Error("You already have an assessment in progress. Resume it instead.");
  }
  if (error?.code === "23514" && error.message.includes("assessment_sessions_question_order_check")) {
    throw new Error(
      "The database needs the live assessment migration. Apply 202611200001_live_ttm_additional_questions.sql and try again.",
    );
  }
  if (error) throw error;
  return mapAssessment(data);
}

export async function saveAssessmentMessage(
  userId: string,
  assessmentId: string,
  input: {
    sender: "bot" | "user";
    text: string;
    messageId: string;
    completed?: boolean;
  },
): Promise<StoredMessage[]> {
  if (
    !input.text ||
    input.text.length > 2000 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.messageId)
  ) {
    throw new Error("The chat message is invalid.");
  }
  const client = getSupabaseClient();
  const { data: row, error: readError } = await client
    .from("assessment_sessions")
    .select("*")
    .eq("id", assessmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) throw new Error("Assessment not found.");

  const messages = arrayFromJson<StoredMessage>(row.messages, "message");
  const existing = messages.find((message) => message.id === input.messageId);
  if (existing) {
    if (existing.sender !== input.sender || existing.text !== input.text) {
      throw new Error("That message ID has already been used for different content.");
    }
    return messages;
  }

  const answers = arrayFromJson<Answer>(row.answers, "answer");
  if (row.status === "abandoned" || row.status === "completed" && input.completed === true) {
    throw new Error("This assessment cannot accept that chat message.");
  }
  if (input.sender === "user" && row.status !== "completed") {
    throw new Error("Submit the current assessment answer before continuing.");
  }
  if (input.completed === true && input.sender !== "bot") {
    throw new Error("Only a bot completion message can complete an assessment.");
  }
  if (input.completed === true) {
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
      throw new Error("Answer all required questions before completing the assessment.");
    }
  }
  if (row.status === "completed" && input.sender !== "user") {
    throw new Error("Only follow-up user messages are accepted after completion.");
  }

  const nextMessages = [...messages, {
    id: input.messageId,
    sender: input.sender,
    text: input.text,
  }];
  const now = new Date().toISOString();
  const status = input.completed === true ? "completed" : row.status;
  const { data, error } = await client
    .from("assessment_sessions")
    .update({
      messages: nextMessages,
      status,
      updated_at: now,
      ...(input.completed === true ? { completed_at: now } : {}),
    })
    .eq("id", row.id)
    .eq("user_id", userId)
    .eq("status", row.status)
    .eq("updated_at", row.updated_at)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error("This assessment changed in another request. Refresh and try again.");
  }
  return arrayFromJson<StoredMessage>(data.messages, "message");
}

export async function abandonAssessment(userId: string, assessmentId: string) {
  const client = getSupabaseClient();
  const { data: row, error: readError } = await client
    .from("assessment_sessions")
    .select("id,status,updated_at")
    .eq("id", assessmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) throw new Error("Assessment not found.");
  if (row.status !== "in_progress") {
    throw new Error("Only an in-progress assessment can be abandoned.");
  }

  const { data, error } = await client
    .from("assessment_sessions")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .eq("updated_at", row.updated_at)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error("This assessment changed in another request. Refresh and try again.");
  }
}

export async function loadAssessmentHistory(userId: string): Promise<AssessmentSummary[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("assessment_sessions")
    .select("id,status,question_order,answers,consent_version,started_at,updated_at,completed_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const deliveredReviews = new Map<string, {
    deliveredAt: string;
    response: string;
    recommendation: string;
    recipe: string;
  }>();
  const assessmentIds = data.map(({ id }) => id);
  if (assessmentIds.length > 0) {
    const { data: reviews, error: reviewsError } = await client
      .from("assessment_reviews")
      .select("assessment_id,delivered_at")
      .in("assessment_id", assessmentIds)
      .not("delivered_at", "is", null);
    if (reviewsError) throw reviewsError;

    const deliveredIds = reviews.map(({ assessment_id }) => assessment_id);
    if (deliveredIds.length > 0) {
      const { data: drafts, error: draftsError } = await client
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
        deliveredReviews.set(review.assessment_id, {
          deliveredAt: review.delivered_at,
          response: draft.response_draft,
          recommendation: draft.recommendation_draft,
          recipe: draft.selected_recipe,
        });
      }
    }
  }

  return data.map((row) => {
    const answers = arrayFromJson<Answer>(row.answers, "answer");
    return {
      id: row.id,
      status: row.status,
      answered: answers.length,
      total: getApplicableQuestionCount(row.question_order, answers),
      consentVersion: row.consent_version,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      reviewDelivery: deliveredReviews.get(row.id) ?? null,
    };
  });
}

export async function loadAssessmentDetail(
  assessmentId: string,
  userId: string,
): Promise<AssessmentSessionDetail> {
  const { data, error } = await getSupabaseClient()
    .from("assessment_sessions")
    .select("*")
    .eq("id", assessmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Assessment not found.");

  return {
    id: data.id,
    status: data.status,
    questionOrder: data.question_order,
    answers: arrayFromJson<Answer>(data.answers, "answer"),
    messages: arrayFromJson<StoredMessage>(data.messages, "message"),
    startedAt: data.started_at,
    completedAt: data.completed_at,
  };
}

export async function loadActiveAssessment(userId: string): Promise<ActiveAssessment | null> {
  const client = getSupabaseClient();
  const { data: active, error } = await client
    .from("assessment_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!active) return null;

  if (
    active.question_order.length === QUESTIONS.length &&
    active.question_order.every((questionId) => QUESTIONS.some((question) => question.id === questionId))
  ) {
    const questionOrder = [
      ...active.question_order,
      ...PILOT_TTM_QUESTIONS.map((question) => question.id),
      ...PILOT_ADDITIONAL_QUESTIONS.map((question) => question.id),
    ];
    const { data: upgraded, error: upgradeError } = await client
      .from("assessment_sessions")
      .update({ question_order: questionOrder, updated_at: new Date().toISOString() })
      .eq("id", active.id)
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .eq("updated_at", active.updated_at)
      .select("*")
      .maybeSingle();
    if (upgradeError) throw upgradeError;
    if (!upgraded) {
      throw new Error("The assessment changed while it was being upgraded. Refresh and try again.");
    }
    return mapAssessment(upgraded);
  }

  return mapAssessment(active);
}
