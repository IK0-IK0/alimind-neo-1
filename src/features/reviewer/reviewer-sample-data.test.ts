import { describe, expect, it } from "vitest";
import {
  PILOT_ADDITIONAL_QUESTIONS,
  PILOT_TPB_QUESTIONS,
  PILOT_TTM_QUESTIONS,
} from "../../data/pilot-survey-questions";
import { SAMPLE_CASES } from "./reviewer-sample-data";

describe("reviewer sample data", () => {
  it("provides complete fabricated pilot-survey responses and TPB formula results for both sets", () => {
    expect(SAMPLE_CASES.map((sampleCase) => sampleCase.set)).toEqual(["A", "B"]);
    for (const sampleCase of SAMPLE_CASES) {
      expect(Object.keys(sampleCase.pilotTpbResponses)).toHaveLength(PILOT_TPB_QUESTIONS.length);
      expect(Object.values(sampleCase.pilotTpbResponses).every((response) => response.length > 0)).toBe(true);
      expect(Object.keys(sampleCase.pilotTtmResponses)).toHaveLength(PILOT_TTM_QUESTIONS.length);
      expect(Object.keys(sampleCase.additionalResponses)).toHaveLength(PILOT_ADDITIONAL_QUESTIONS.length);
      expect(sampleCase.tpbScores.attitude.beliefBased).not.toBeNull();
      expect(sampleCase.tpbScores.subjectiveNorm.beliefBased).not.toBeNull();
      expect(sampleCase.tpbScores.perceivedControl.beliefBased).not.toBeNull();
      expect(sampleCase.tpbScores.intention).not.toBeNull();
      expect(sampleCase.ttmResult.status).toBe("classified");
    }
  });

  it("keeps the fabricated TTM answers consistent with conditional branches", () => {
    const [preparation, contemplation] = SAMPLE_CASES;

    expect(preparation.pilotTtmResponses).toMatchObject({
      63: false,
      64: null,
      65: true,
      66: true,
    });
    expect(contemplation.pilotTtmResponses).toMatchObject({
      63: false,
      64: null,
      65: true,
      66: false,
    });
  });

  it("uses valid answer options and retains applicable additional-question follow-ups", () => {
    for (const sampleCase of SAMPLE_CASES) {
      for (const question of PILOT_ADDITIONAL_QUESTIONS) {
        const response = sampleCase.additionalResponses[question.id];
        expect(response).toBeDefined();
        if (question.options) {
          const selectedOptions = Array.isArray(response.value) ? response.value : [response.value];
          expect(selectedOptions.every((value) => question.options?.includes(value))).toBe(true);
        }
      }
    }

    expect(SAMPLE_CASES[1].additionalResponses["pilot-additional-69"].followUp).toBeTruthy();
    expect(SAMPLE_CASES[1].additionalResponses["pilot-additional-70"].followUp).toBeTruthy();
  });

  it("calculates belief products and keeps direct construct scores separate", () => {
    const setA = SAMPLE_CASES[0].tpbScores;

    expect(setA.attitude.beliefBased).toMatchObject({ itemCount: 4, sum: 92, mean: 23 });
    expect(setA.attitude.direct).toBeNull();
    expect(setA.subjectiveNorm.beliefBased).toMatchObject({ itemCount: 3, sum: 86 });
    expect(setA.perceivedControl.beliefBased).toMatchObject({ itemCount: 4, sum: 86 });
    expect(setA.intention).toMatchObject({ itemCount: 3, mean: 17 / 3 });
  });
});
