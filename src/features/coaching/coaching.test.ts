import { describe, expect, it } from "vitest";
import { getNextStep, selectBCT } from "./coaching";

describe("stage and factor coaching", () => {
  it("provides an intervention and next step for every stage and factor", () => {
    const stages = ["Pre-contemplation", "Contemplation", "Preparation", "Action", "Maintenance"] as const;
    const factors = ["attitude", "subjectiveNorm", "perceivedControl"] as const;
    for (const stage of stages) {
      for (const factor of factors) {
        expect(selectBCT(stage, factor).length).toBeGreaterThan(0);
        expect(getNextStep(factor).length).toBeGreaterThan(0);
      }
    }
  });
});
