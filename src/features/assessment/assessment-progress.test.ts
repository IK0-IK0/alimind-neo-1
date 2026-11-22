import { describe, expect, it } from "vitest";
import { getApplicableQuestionCount } from "./assessment-progress";

describe("getApplicableQuestionCount", () => {
  it("excludes follow-up questions for an unselected stage-of-change branch", () => {
    const questionOrder = ["pilot-ttm-63", "pilot-ttm-64", "pilot-ttm-65", "pilot-ttm-66"];
    const answers = [
      { questionId: "pilot-ttm-63", response: "No", score: null },
      { questionId: "pilot-ttm-65", response: "No", score: null },
    ];

    expect(getApplicableQuestionCount(questionOrder, answers)).toBe(2);
  });

  it("keeps an unanswered dependency eligible until its answer is known", () => {
    expect(getApplicableQuestionCount(
      ["pilot-ttm-63", "pilot-ttm-64"],
      [{ questionId: "pilot-ttm-63", response: null, score: null }],
    )).toBe(2);
  });
});
