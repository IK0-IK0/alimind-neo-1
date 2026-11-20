import { describe, expect, it } from "vitest";
import {
  TPB_FREE_TEXT_QUESTION_COUNT,
  TPB_FREE_TEXT_SECTIONS,
} from "./tpb-free-text-questionnaire";

describe("TPB free-text questionnaire", () => {
  it("includes all 38 unique source items in their original sections", () => {
    const questions = TPB_FREE_TEXT_SECTIONS.flatMap((section) => section.questions);

    expect(TPB_FREE_TEXT_QUESTION_COUNT).toBe(38);
    expect(TPB_FREE_TEXT_SECTIONS).toHaveLength(10);
    expect(questions).toHaveLength(38);
    expect(new Set(questions.map((question) => question.id)).size).toBe(38);
    expect(questions.map((question) => question.number)).toEqual(
      Array.from({ length: 38 }, (_, index) => index + 1),
    );
    expect(TPB_FREE_TEXT_SECTIONS.map((section) => section.construct)).toEqual([
      "attitude",
      "attitude",
      "attitude",
      "subjectiveNorm",
      "subjectiveNorm",
      "subjectiveNorm",
      "perceivedControl",
      "perceivedControl",
      "perceivedControl",
      "intention",
    ]);
  });

  it("keeps source scale anchors as metadata while preparing open-text prompts", () => {
    const questions = TPB_FREE_TEXT_SECTIONS.flatMap((section) => section.questions);

    for (const question of questions) {
      expect(question.prompt).not.toContain("1 — 2");
      expect(question.responsePrompt).toBe("Tell us what makes you feel this way.");
      expect(question.sourceScale.low).toBeTruthy();
      expect(question.sourceScale.high).toBeTruthy();
    }
  });
});
