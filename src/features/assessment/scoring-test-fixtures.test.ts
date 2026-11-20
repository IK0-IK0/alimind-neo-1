import { describe, expect, it } from "vitest";
import { QUESTIONS } from "../../data/questionnaire";
import { scoreResponse } from "./scoring";
import { getTpbScoringTestResponse } from "./scoring-test-fixtures";

describe("automated scoring test fixtures", () => {
  it("provides synthetic answers for every live assessment question", () => {
    expect(QUESTIONS.every((question) => getTpbScoringTestResponse(question).length > 0)).toBe(true);
  });

  it("keeps each synthetic intention answer scoreable by the live phrase scorer", () => {
    const intentionQuestions = QUESTIONS.filter((question) => question.construct === "intention");

    expect(intentionQuestions.every((question) =>
      scoreResponse(question, getTpbScoringTestResponse(question)) !== null,
    )).toBe(true);
  });
});
