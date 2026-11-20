import type { TpbScoreValue } from "../assessment/tpb-q1-experiment";

export type Q1ScoreReview =
  | { status: "pending" }
  | { status: "confirmed"; score: TpbScoreValue }
  | { status: "overridden"; score: TpbScoreValue; reason: string }
  | { status: "unscorable"; reason: string };

export const PENDING_Q1_REVIEW: Q1ScoreReview = { status: "pending" };

export function isTpbScoreValue(value: unknown): value is TpbScoreValue {
  return Number.isInteger(value) && typeof value === "number" && value >= 1 && value <= 7;
}

export function confirmQ1Proposal(proposedScore: unknown): Q1ScoreReview | null {
  return isTpbScoreValue(proposedScore)
    ? { status: "confirmed", score: proposedScore }
    : null;
}

export function overrideQ1Score(score: unknown, reason: string): Q1ScoreReview | null {
  const normalizedReason = reason.trim();
  return isTpbScoreValue(score) && normalizedReason
    ? { status: "overridden", score, reason: normalizedReason }
    : null;
}

export function markQ1Unscorable(reason: string): Q1ScoreReview | null {
  const normalizedReason = reason.trim();
  return normalizedReason
    ? { status: "unscorable", reason: normalizedReason }
    : null;
}

export function canPublishHumanResult(
  review: Q1ScoreReview,
  response: string,
  recommendation: string,
): boolean {
  return review.status !== "pending"
    && response.trim().length > 0
    && recommendation.trim().length > 0;
}

export function formatHumanReviewDecision(review: Q1ScoreReview): string {
  switch (review.status) {
    case "pending":
      return "Awaiting human score review.";
    case "confirmed":
      return `Human-confirmed score: ${review.score}/7.`;
    case "overridden":
      return `Human-adjusted score: ${review.score}/7. Reason: ${review.reason}`;
    case "unscorable":
      return `Marked unscorable by the reviewer. Reason: ${review.reason}`;
  }
}
