import { describe, expect, it } from "vitest";
import { QUESTIONS } from "../../data/questionnaire";
import { calculateProfile } from "../assessment/scoring";
import {
  createPipelineAnswers,
  createPipelineScenario,
  PIPELINE_LAB_FACTORS,
} from "./lab";

describe("pipeline lab scenarios", () => {
  it("creates TPB fixtures with the selected factor weaker than the others", () => {
    for (const factor of PIPELINE_LAB_FACTORS) {
      const answers = createPipelineAnswers(createPipelineScenario(factor));
      const profile = calculateProfile(QUESTIONS, answers);

      expect(profile.stage).toBeNull();
      expect(profile.weakest).toBe(factor);
      expect(profile.scores[factor]).toBe(25);
      expect(profile.readiness).toBeNull();
      for (const otherFactor of PIPELINE_LAB_FACTORS.filter((candidate) => candidate !== factor)) {
        expect(profile.scores[otherFactor]).toBe(75);
      }
    }
  });
});
