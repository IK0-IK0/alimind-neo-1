export interface ScoreProbability {
  score: number;
  probability: number;
}

export interface CalibrationEvidence {
  status: "experimental" | "validated";
  version: string;
  validationSampleSize: number;
  approvedForAutomaticProgression: boolean;
}

export interface CalibratedAnswerPrediction {
  questionId: string;
  predictedScore: number;
  probabilities: readonly ScoreProbability[];
  calibration: CalibrationEvidence;
}

export type AnswerConfidenceDecision =
  | {
      action: "use-existing-flow";
      reason: "model-not-configured";
    }
  | {
      action: "continue";
      reason: "validated-confidence-above-threshold";
      predictedScore: number;
      topProbability: number;
      calibrationVersion: string;
    }
  | {
      action: "ask-follow-up";
      reason:
        | "prediction-invalid"
        | "policy-invalid"
        | "calibration-unavailable"
        | "calibration-not-approved"
        | "confidence-below-threshold";
      predictedScore: number | null;
      topProbability: number | null;
      prompt: string;
    };

export const DEFAULT_AUTO_PROGRESSION_THRESHOLD = 0.8;

const MINIMUM_PROBABILITY_SUM = 0.99;
const MAXIMUM_PROBABILITY_SUM = 1.01;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidPrediction(value: unknown): value is CalibratedAnswerPrediction {
  if (!isRecord(value) || !isRecord(value.calibration) || !Array.isArray(value.probabilities)) return false;
  const { questionId, predictedScore, probabilities, calibration } = value;
  if (
    typeof questionId !== "string"
    || !questionId.trim()
    || typeof predictedScore !== "number"
    || !Number.isFinite(predictedScore)
    || (calibration.status !== "experimental" && calibration.status !== "validated")
    || typeof calibration.version !== "string"
    || typeof calibration.validationSampleSize !== "number"
    || typeof calibration.approvedForAutomaticProgression !== "boolean"
  ) {
    return false;
  }
  if (probabilities.length < 2) return false;

  const scores = new Set<number>();
  let probabilityTotal = 0;
  let highestProbability = -1;
  let mostLikelyScore: number | null = null;
  for (const item of probabilities) {
    if (!isRecord(item) || typeof item.score !== "number" || typeof item.probability !== "number") return false;
    const { score, probability } = item;
    if (!Number.isFinite(score) || !Number.isFinite(probability) || probability < 0 || probability > 1) {
      return false;
    }
    if (scores.has(score)) return false;
    scores.add(score);
    probabilityTotal += probability;
    if (probability > highestProbability) {
      highestProbability = probability;
      mostLikelyScore = score;
    }
  }

  return probabilityTotal >= MINIMUM_PROBABILITY_SUM
    && probabilityTotal <= MAXIMUM_PROBABILITY_SUM
    && mostLikelyScore === predictedScore;
}

function followUpPrompt(questionPrompt: string): string {
  const normalizedPrompt = questionPrompt.trim();
  return normalizedPrompt
    ? `I want to make sure I understand. Could you tell me a little more about your answer to: "${normalizedPrompt}"`
    : "I want to make sure I understand. Could you tell me a little more about your answer?";
}

export function decideAnswerConfidence(
  questionPrompt: string,
  prediction: unknown,
  threshold = DEFAULT_AUTO_PROGRESSION_THRESHOLD,
): AnswerConfidenceDecision {
  if (prediction === null || prediction === undefined) {
    return { action: "use-existing-flow", reason: "model-not-configured" };
  }

  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    return {
      action: "ask-follow-up",
      reason: "policy-invalid",
      predictedScore: null,
      topProbability: null,
      prompt: followUpPrompt(questionPrompt),
    };
  }

  if (!isValidPrediction(prediction)) {
    return {
      action: "ask-follow-up",
      reason: "prediction-invalid",
      predictedScore: null,
      topProbability: null,
      prompt: followUpPrompt(questionPrompt),
    };
  }

  const topProbability = Math.max(...prediction.probabilities.map(({ probability }) => probability));
  if (
    prediction.calibration.status !== "validated"
    || !prediction.calibration.version.trim()
    || !Number.isInteger(prediction.calibration.validationSampleSize)
    || prediction.calibration.validationSampleSize <= 0
  ) {
    return {
      action: "ask-follow-up",
      reason: "calibration-unavailable",
      predictedScore: prediction.predictedScore,
      topProbability,
      prompt: followUpPrompt(questionPrompt),
    };
  }

  if (!prediction.calibration.approvedForAutomaticProgression) {
    return {
      action: "ask-follow-up",
      reason: "calibration-not-approved",
      predictedScore: prediction.predictedScore,
      topProbability,
      prompt: followUpPrompt(questionPrompt),
    };
  }

  if (topProbability < threshold) {
    return {
      action: "ask-follow-up",
      reason: "confidence-below-threshold",
      predictedScore: prediction.predictedScore,
      topProbability,
      prompt: followUpPrompt(questionPrompt),
    };
  }

  return {
    action: "continue",
    reason: "validated-confidence-above-threshold",
    predictedScore: prediction.predictedScore,
    topProbability,
    calibrationVersion: prediction.calibration.version,
  };
}
