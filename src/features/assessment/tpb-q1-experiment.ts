export type TpbScoreValue = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TpbScoreReferenceGroup {
  score: TpbScoreValue;
  answers: readonly string[];
}

export interface TpbScoreProbability {
  score: TpbScoreValue;
  probability: number;
}

export interface TpbQ1ExperimentResult {
  model: string;
  method: string;
  predictedScore: TpbScoreValue;
  estimatedConfidence: number;
  probabilities: TpbScoreProbability[];
  syntheticEvaluation: {
    trainCount: number;
    calibrationCount: number;
    testCount: number;
    testMae: number;
    testWithinOne: number;
    testBrierScore: number;
    testEce: number;
    note: string;
  };
}
