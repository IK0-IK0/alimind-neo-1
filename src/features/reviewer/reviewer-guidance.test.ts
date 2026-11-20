import { describe, expect, it } from "vitest";
import { QUESTIONS } from "../../data/questionnaire";
import { calculateProfile, makeAnswer } from "../assessment/scoring";
import { SAMPLE_CASES } from "./reviewer-sample-data";
import { getReviewerGuidance, getReviewerGuidanceFromProfile } from "./reviewer-guidance";

describe("reviewer response guidance", () => {
  it("uses the TTM stage and lowest normalized TPB signal for Set A", () => {
    const guidance = getReviewerGuidance(SAMPLE_CASES[0]);

    expect(guidance.lowestTpbSignal).toBe("Perceived control · belief-based composite");
    expect(guidance.response).toContain("preparing to begin soon");
    expect(guidance.response).toContain("time, budget, and access");
    expect(guidance.recommendation).toContain("Before this week");
    expect(guidance.recommendation).toContain("affordable and easy to find");
  });

  it("uses the TTM stage and lowest normalized TPB signal for Set B", () => {
    const guidance = getReviewerGuidance(SAMPLE_CASES[1]);

    expect(guidance.lowestTpbSignal).toBe("Perceived control · belief-based composite");
    expect(guidance.response).toContain("weigh the benefits and barriers");
    expect(guidance.recommendation).toContain("When you feel ready");
    expect(guidance.recommendation).toContain("backup for busy days");
  });

  it("uses provisional assessment estimates without inventing a TPB score", () => {
    const answers = QUESTIONS.map((question) => makeAnswer(question, question.keywords[0][0]));
    const guidance = getReviewerGuidanceFromProfile(calculateProfile(QUESTIONS, answers));

    expect(guidance.lowestTpbSignal).toBe("Attitude · experimental model estimate");
    expect(guidance.response).toContain("no pressure to change everything");
    expect(guidance.recommendation).toContain("explore one benefit or concern");
  });
});
