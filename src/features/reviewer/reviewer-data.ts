import { getSupabaseClient } from "../../auth/client";
import { getApplicableQuestionCount } from "../assessment/assessment-progress";
import type { Answer } from "../assessment/scoring";
import { arrayFromJson } from "../../lib/supabase/json";
import type { Json } from "../../lib/supabase/types";
import {
  getReviewerProfileSummary,
  getReviewerQuestionAnswers,
  type ReviewerProfileSummary,
  type ReviewerQuestionAnswer,
} from "./reviewer-assessment";

export type ReviewStatus = "needs_review" | "in_progress" | "completed";
export type Assignment = "you" | "another_reviewer" | null;

export interface QueueAssessment {
  id: string;
  submittedAt: string;
  answered: number;
  total: number;
  reviewStatus: ReviewStatus;
  assignment: Assignment;
  profile: ReviewerProfileSummary | null;
}

export interface QueueResponse {
  assessments: QueueAssessment[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ReviewerMessage {
  id: string;
  sender: "bot" | "user";
  text: string;
}

export interface ReviewRecord {
  status: Exclude<ReviewStatus, "needs_review">;
  assignment: Assignment;
  responseDraft?: string;
  recommendationDraft?: string;
  selectedRecipe?: string;
  updatedAt: string;
  completedAt: string | null;
  deliveredAt: string | null;
}

export interface ReviewerAssessmentDetail {
  assessment: {
    id: string;
    submittedAt: string;
    answered: number;
    total: number;
    messages: ReviewerMessage[];
    questionAnswers: ReviewerQuestionAnswer[];
    profile: ReviewerProfileSummary | null;
  };
  review: ReviewRecord | null;
}

const pageSize = 25;

function answersFromJson(value: Json) {
  return arrayFromJson<Answer>(value, "answer");
}

export async function loadReviewerAssessmentQueue(
  page: number,
  reviewerId: string,
): Promise<QueueResponse> {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new Error("The reviewer queue page is invalid.");
  }
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const client = getSupabaseClient();
  const { data: assessments, count, error } = await client
    .from("assessment_sessions")
    .select("id,question_order,answers,started_at,updated_at,completed_at", { count: "exact" })
    .eq("status", "completed")
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false })
    .range(from, to);
  if (error) throw error;

  const assessmentIds = assessments.map(({ id }) => id);
  const reviewsByAssessment = new Map<string, {
    assessment_id: string;
    reviewer_id: string;
    status: "in_progress" | "completed";
  }>();
  if (assessmentIds.length > 0) {
    const { data: reviews, error: reviewsError } = await client
      .from("assessment_reviews")
      .select("assessment_id,reviewer_id,status")
      .in("assessment_id", assessmentIds);
    if (reviewsError) throw reviewsError;
    for (const review of reviews) reviewsByAssessment.set(review.assessment_id, review);
  }

  return {
    assessments: assessments.map((assessment) => {
      const review = reviewsByAssessment.get(assessment.id);
      const answers = answersFromJson(assessment.answers);
      return {
        id: assessment.id,
        submittedAt: assessment.completed_at ?? assessment.updated_at,
        answered: answers.length,
        total: getApplicableQuestionCount(assessment.question_order, answers),
        reviewStatus: review?.status ?? "needs_review",
        assignment: review ? review.reviewer_id === reviewerId ? "you" : "another_reviewer" : null,
        profile: getReviewerProfileSummary(assessment.question_order, answers),
      };
    }),
    page,
    pageSize,
    total: count ?? assessments.length,
  };
}

export async function loadReviewerAssessmentDetail(
  assessmentId: string,
  reviewerId: string,
): Promise<ReviewerAssessmentDetail> {
  const client = getSupabaseClient();
  const { data: assessment, error } = await client
    .from("assessment_sessions")
    .select("id,status,question_order,answers,messages,started_at,updated_at,completed_at")
    .eq("id", assessmentId)
    .eq("status", "completed")
    .maybeSingle();
  if (error) throw error;
  if (!assessment) throw new Error("Completed assessment not found.");

  const { data: review, error: reviewError } = await client
    .from("assessment_reviews")
    .select("assessment_id,reviewer_id,status,started_at,updated_at,completed_at,delivered_at")
    .eq("assessment_id", assessmentId)
    .maybeSingle();
  if (reviewError) throw reviewError;

  const canReadReviewDraft = review?.status === "completed" || review?.reviewer_id === reviewerId;
  let reviewDraft: {
    response_draft: string;
    recommendation_draft: string;
    selected_recipe: string;
  } | null = null;
  if (review && canReadReviewDraft) {
    const { data, error: draftError } = await client
      .from("assessment_review_drafts")
      .select("response_draft,recommendation_draft,selected_recipe")
      .eq("assessment_id", assessmentId)
      .maybeSingle();
    if (draftError) throw draftError;
    reviewDraft = data;
  }

  const answers = answersFromJson(assessment.answers);
  return {
    assessment: {
      id: assessment.id,
      submittedAt: assessment.completed_at ?? assessment.updated_at,
      answered: answers.length,
      total: getApplicableQuestionCount(assessment.question_order, answers),
      messages: arrayFromJson<ReviewerMessage>(assessment.messages, "message"),
      questionAnswers: getReviewerQuestionAnswers(assessment.question_order, answers),
      profile: getReviewerProfileSummary(assessment.question_order, answers),
    },
    review: review
      ? {
          status: review.status,
          assignment: review.reviewer_id === reviewerId ? "you" : "another_reviewer",
          ...(canReadReviewDraft
            ? {
                responseDraft: reviewDraft?.response_draft ?? "",
                recommendationDraft: reviewDraft?.recommendation_draft ?? "",
                selectedRecipe: reviewDraft?.selected_recipe ?? "",
              }
            : {}),
          updatedAt: review.updated_at,
          completedAt: review.completed_at,
          deliveredAt: review.delivered_at,
        }
      : null,
  };
}
