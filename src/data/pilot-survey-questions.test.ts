import { describe, expect, it } from "vitest";
import {
  PILOT_ADDITIONAL_QUESTIONS,
  PILOT_SURVEY_SECTIONS,
  PILOT_TPB_QUESTIONS,
  PILOT_TTM_QUESTIONS,
} from "./pilot-survey-questions";

describe("pilot survey questions", () => {
  it("contains the 57 non-intention items under the three TPB constructs", () => {
    expect(PILOT_TPB_QUESTIONS).toHaveLength(57);
    expect(PILOT_TPB_QUESTIONS.map((item) => item.number)).toEqual(
      Array.from({ length: 57 }, (_, index) => index + 1),
    );
    expect(new Set(PILOT_TPB_QUESTIONS.map((item) => item.construct))).toEqual(
      new Set(["attitude", "subjectiveNorm", "perceivedControl"]),
    );
  });

  it("uses open-ended prompts without numeric rating scales", () => {
    expect(PILOT_TPB_QUESTIONS.every((item) => item.prompt.includes("?"))).toBe(true);
    expect(PILOT_TPB_QUESTIONS.every((item) =>
      !/rate from 1|strongly agree|strongly disagree/i.test(item.prompt),
    )).toBe(true);
    expect(PILOT_TPB_QUESTIONS.every((item) => !("scale" in item))).toBe(true);
  });

  it("organizes TPB, the existing conditional TTM screen, and additional survey questions", () => {
    expect(PILOT_SURVEY_SECTIONS.map((section) => section.id)).toEqual([
      "tpb",
      "ttm",
      "additional",
    ]);
    expect(PILOT_TTM_QUESTIONS.map((item) => item.number)).toEqual([63, 64, 65, 66]);
    expect(PILOT_TTM_QUESTIONS[1]?.dependsOn).toEqual({ questionNumber: 63, answer: true });
    expect(PILOT_TTM_QUESTIONS[2]?.dependsOn).toEqual({ questionNumber: 63, answer: false });
    expect(PILOT_TTM_QUESTIONS[3]?.dependsOn).toEqual({ questionNumber: 65, answer: true });
    expect(PILOT_ADDITIONAL_QUESTIONS.map((item) => item.number)).toEqual(
      Array.from({ length: 6 }, (_, index) => index + 67),
    );
    expect(PILOT_ADDITIONAL_QUESTIONS[0]?.type).toBe("number");
    expect(PILOT_ADDITIONAL_QUESTIONS[3]?.type).toBe("multiSelect");
    expect(PILOT_ADDITIONAL_QUESTIONS.map((item) => item.prompt)).not.toContain(
      "What is your approximate monthly allowance or income?",
    );
  });
});
