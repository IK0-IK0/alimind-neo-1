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

function mapAssessment(row: AssessmentRecord): ActiveAssessment {
  return {
    id: row.id,
    status: "in_progress",
    questionOrder: row.question_order,
    answers: arrayFromJson<Answer>(row.answers, "answer"),
    messages: arrayFromJson<StoredMessage>(row.messages, "message"),
  };
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
