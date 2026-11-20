import { describe, expect, it } from "vitest";
import {
  decideAnswerConfidence,
  type CalibratedAnswerPrediction,
} from "./answer-confidence";

const questionPrompt = "Eating nutritious meals would help me maintain good health.";

function makePrediction(
  probabilities: number[],
  overrides: Partial<CalibratedAnswerPrediction["calibration"]> = {},
): CalibratedAnswerPrediction {
  const distribution = probabilities.map((probability, index) => ({
    score: index + 1,
    probability,
  }));
  const predictedScore = distribution.reduce((best, item) =>
    item.probability > best.probability ? item : best,
  ).score;
  return {
    questionId: "tpb-01",
    predictedScore,
    probabilities: distribution,
    calibration: {
      status: "validated",
      version: "tpb-q1-calibration-v1",
      validationSampleSize: 500,
      approvedForAutomaticProgression: true,
      ...overrides,
    },
  };
}

describe("live answer confidence gate", () => {
  it("preserves today's chat behavior when no model is configured", () => {
    expect(decideAnswerConfidence(questionPrompt, null)).toEqual({
      action: "use-existing-flow",
      reason: "model-not-configured",
    });
  });

  it("continues only when validated, approved probability meets the threshold", () => {
    const result = decideAnswerConfidence(
      questionPrompt,
      makePrediction([0.01, 0.02, 0.03, 0.04, 0.08, 0.12, 0.70]),
      0.7,
    );

    expect(result).toMatchObject({
      action: "continue",
      predictedScore: 7,
      topProbability: 0.7,
      calibrationVersion: "tpb-q1-calibration-v1",
    });
  });

  it("accepts exactly 0.8 at the default threshold", () => {
    expect(
      decideAnswerConfidence(
        questionPrompt,
        makePrediction([0.01, 0.01, 0.01, 0.02, 0.03, 0.12, 0.8]),
      ),
    ).toMatchObject({
      action: "continue",
      topProbability: 0.8,
    });
  });

  it("asks a follow-up when validated confidence is below the configured threshold", () => {
    const result = decideAnswerConfidence(
      questionPrompt,
      makePrediction([0.01, 0.02, 0.03, 0.04, 0.08, 0.12, 0.70]),
    );

    expect(result).toMatchObject({
      action: "ask-follow-up",
      reason: "confidence-below-threshold",
      topProbability: 0.7,
    });
    expect(result.action === "ask-follow-up" && result.prompt).toContain(questionPrompt);
  });

  it.each([
    ["experimental calibration", { status: "experimental" as const }],
    ["unapproved calibration", { approvedForAutomaticProgression: false }],
    ["missing validation sample", { validationSampleSize: 0 }],
    ["missing calibration version", { version: "" }],
  ])("asks a follow-up for %s", (_description, calibrationOverrides) => {
    expect(
      decideAnswerConfidence(
        questionPrompt,
        makePrediction([0.01, 0.02, 0.03, 0.04, 0.08, 0.12, 0.70], calibrationOverrides),
      ),
    ).toMatchObject({ action: "ask-follow-up" });
  });

  it("fails closed for malformed probability outputs", () => {
    const invalid = makePrediction([0.01, 0.02, 0.03, 0.04, 0.08, 0.12, 0.30]);
    expect(decideAnswerConfidence(questionPrompt, invalid)).toMatchObject({
      action: "ask-follow-up",
      reason: "prediction-invalid",
    });
  });

  it("fails closed for malformed model payloads", () => {
    expect(decideAnswerConfidence(questionPrompt, { probabilities: null })).toMatchObject({
      action: "ask-follow-up",
      reason: "prediction-invalid",
    });
    expect(decideAnswerConfidence(questionPrompt, {
      ...makePrediction([0.01, 0.02, 0.03, 0.04, 0.08, 0.12, 0.70]),
      calibration: null,
    })).toMatchObject({
      action: "ask-follow-up",
      reason: "prediction-invalid",
    });
  });

  it("fails closed for an invalid confidence threshold", () => {
    expect(
      decideAnswerConfidence(questionPrompt, makePrediction([0.01, 0.02, 0.03, 0.04, 0.08, 0.12, 0.70]), 0),
    ).toMatchObject({ action: "ask-follow-up", reason: "policy-invalid" });
  });

  it("fails closed when the prediction label is not the most likely class", () => {
    const invalid = makePrediction([0.01, 0.02, 0.03, 0.04, 0.08, 0.12, 0.70]);
    invalid.predictedScore = 6;

    expect(decideAnswerConfidence(questionPrompt, invalid)).toMatchObject({
      action: "ask-follow-up",
      reason: "prediction-invalid",
    });
  });
});
