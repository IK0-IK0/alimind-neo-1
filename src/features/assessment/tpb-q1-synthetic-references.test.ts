import { describe, expect, it } from "vitest";
import { TPB_Q1_SYNTHETIC_REFERENCE_GROUPS } from "./tpb-q1-synthetic-references";

describe("synthetic TPB Q1 experiment data", () => {
  it("provides ten non-empty answers for each score from 1 through 7", () => {
    expect(TPB_Q1_SYNTHETIC_REFERENCE_GROUPS.map(({ score, answers }) => [
      score,
      answers.length,
      answers.every((answer) => answer.trim().length > 0),
    ])).toEqual([
      [1, 10, true],
      [2, 10, true],
      [3, 10, true],
      [4, 10, true],
      [5, 10, true],
      [6, 10, true],
      [7, 10, true],
    ]);
  });
});
