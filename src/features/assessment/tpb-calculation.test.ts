import { describe, expect, it } from "vitest";
import {
  calculateTpb,
  reverseTpbRating,
  TPB_RESPONSE_SCALE,
} from "./tpb-calculation";

describe("TPB construct calculations", () => {
  it("calculates belief-based attitude as the mean of belief × outcome-evaluation products", () => {
    const result = calculateTpb({
      attitudeBeliefs: [
        { belief: 6, evaluation: 7 },
        { belief: 5, evaluation: 2 },
      ],
    });

    expect(result.attitude.beliefBased).toEqual({
      itemCount: 2,
      sum: 52,
      mean: 26,
      itemMin: 1,
      itemMax: 49,
    });
    expect(result.attitude.direct).toBeNull();
  });

  it("keeps belief-based and direct norm, control, and intention scores separate", () => {
    const result = calculateTpb({
      directAttitude: [2, 4, 6],
      normativeBeliefs: [
        { belief: 6, motivationToComply: 5 },
        { belief: 4, motivationToComply: 3 },
      ],
      directSubjectiveNorm: [5, 6, 7],
      controlBeliefs: [{ belief: 4, perceivedPower: 6 }],
      directPerceivedControl: [4, 6],
      intention: [6, 7],
    });

    expect(result.attitude.beliefBased).toBeNull();
    expect(result.attitude.direct?.mean).toBe(4);
    expect(result.subjectiveNorm.beliefBased?.mean).toBe(21);
    expect(result.subjectiveNorm.direct?.mean).toBe(6);
    expect(result.perceivedControl.beliefBased?.mean).toBe(24);
    expect(result.perceivedControl.direct?.mean).toBe(5);
    expect(result.intention?.mean).toBe(6.5);
  });

  it("leaves unprovided constructs missing rather than treating them as zero", () => {
    const result = calculateTpb({});

    expect(result).toEqual({
      attitude: { beliefBased: null, direct: null },
      subjectiveNorm: { beliefBased: null, direct: null },
      perceivedControl: { beliefBased: null, direct: null },
      intention: null,
    });
  });

  it("rejects values outside the declared 1–7 response scale", () => {
    expect(TPB_RESPONSE_SCALE).toEqual({ min: 1, max: 7 });
    expect(() => calculateTpb({ attitudeBeliefs: [{ belief: 8, evaluation: 3 }] }))
      .toThrow(RangeError);
    expect(() => calculateTpb({ intention: [1, 3.5] })).toThrow(RangeError);
  });

  it("reverse-codes a rating only when explicitly requested", () => {
    expect(reverseTpbRating(1)).toBe(7);
    expect(reverseTpbRating(4)).toBe(4);
    expect(reverseTpbRating(7)).toBe(1);
    expect(reverseTpbRating(2, 0, 6)).toBe(4);
  });
});
