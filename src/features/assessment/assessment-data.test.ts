import { describe, expect, it } from "vitest";
import { QUESTIONS } from "../../data/questionnaire";
import { recalculateMissingKeywordScores } from "./assessment-data";

describe("recalculateMissingKeywordScores", () => {
  it("backfills an unmatched old response with the neutral midpoint", () => {
    const question = QUESTIONS.find(({ construct }) => construct === "attitude")!;
    const result = recalculateMissingKeywordScores([{
      questionId: question.id,
      response: "I do not know what to say",
      score: null,
    }]);

    expect(result.changed).toBe(true);
    expect(result.answers[0]?.score).toBe(50);
  });

  it("preserves existing model ratings and skipped answers", () => {
    const question = QUESTIONS.find(({ construct }) => construct === "attitude")!;
    const answers = [
      { questionId: question.id, response: "Existing model response", score: null, tpbModelRating: 3.5 },
      { questionId: QUESTIONS[1]!.id, response: null, score: null },
    ];

    const result = recalculateMissingKeywordScores(answers);

    expect(result.changed).toBe(false);
    expect(result.answers).toEqual(answers);
  });
});
