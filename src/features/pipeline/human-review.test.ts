import { describe, expect, it } from "vitest";
import {
  canPublishHumanResult,
  confirmQ1Proposal,
  formatHumanReviewDecision,
  markQ1Unscorable,
  overrideQ1Score,
  PENDING_Q1_REVIEW,
} from "./human-review";

describe("Pipeline Lab human review", () => {
  it("only confirms an integer Q1 score in the 1–7 range", () => {
    expect(confirmQ1Proposal(4)).toEqual({ status: "confirmed", score: 4 });
    expect(confirmQ1Proposal(0)).toBeNull();
    expect(confirmQ1Proposal(8)).toBeNull();
    expect(confirmQ1Proposal(4.5)).toBeNull();
    expect(confirmQ1Proposal(undefined)).toBeNull();
  });

  it("requires a reason to override a score", () => {
    expect(overrideQ1Score(3, "Reviewed answer and corrected model proposal.")).toEqual({
      status: "overridden",
      score: 3,
      reason: "Reviewed answer and corrected model proposal.",
    });
    expect(overrideQ1Score(3, "  ")).toBeNull();
    expect(overrideQ1Score(9, "Not in range")).toBeNull();
  });

  it("requires a reason to mark an answer unscorable", () => {
    expect(markQ1Unscorable("Answer is unrelated to the item.")).toEqual({
      status: "unscorable",
      reason: "Answer is unrelated to the item.",
    });
    expect(markQ1Unscorable(" ")).toBeNull();
  });

  it("does not allow publishing before an explicit review decision and both authored fields", () => {
    expect(canPublishHumanResult(PENDING_Q1_REVIEW, "Message", "Recommendation")).toBe(false);
    expect(canPublishHumanResult({ status: "confirmed", score: 5 }, " ", "Recommendation")).toBe(false);
    expect(canPublishHumanResult({ status: "confirmed", score: 5 }, "Message", " ")).toBe(false);
    expect(canPublishHumanResult(
      { status: "confirmed", score: 5 },
      "Human-written response.",
      "Human-written recommendation.",
    )).toBe(true);
    expect(canPublishHumanResult(
      { status: "unscorable", reason: "Insufficient information." },
      "Human-written response.",
      "Human-written recommendation.",
    )).toBe(true);
  });

  it("formats only the explicit human decision", () => {
    expect(formatHumanReviewDecision(PENDING_Q1_REVIEW)).toBe("Awaiting human score review.");
    expect(formatHumanReviewDecision({ status: "confirmed", score: 7 })).toBe("Human-confirmed score: 7/7.");
  });
});
