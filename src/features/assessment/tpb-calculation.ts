export const TPB_RESPONSE_SCALE = {
  min: 1,
  max: 7,
} as const;

export interface TpbBeliefEvaluationPair {
  belief: number;
  evaluation: number;
}

export interface TpbBeliefMotivationPair {
  belief: number;
  motivationToComply: number;
}

export interface TpbControlPowerPair {
  belief: number;
  perceivedPower: number;
}

export interface TpbCalculationInput {
  attitudeBeliefs?: readonly TpbBeliefEvaluationPair[];
  directAttitude?: readonly number[];
  normativeBeliefs?: readonly TpbBeliefMotivationPair[];
  controlBeliefs?: readonly TpbControlPowerPair[];
  directSubjectiveNorm?: readonly number[];
  directPerceivedControl?: readonly number[];
  intention?: readonly number[];
}

export interface TpbConstructScore {
  itemCount: number;
  sum: number;
  mean: number;
  itemMin: number;
  itemMax: number;
}

export interface TpbCalculation {
  attitude: {
    beliefBased: TpbConstructScore | null;
    direct: TpbConstructScore | null;
  };
  subjectiveNorm: {
    beliefBased: TpbConstructScore | null;
    direct: TpbConstructScore | null;
  };
  perceivedControl: {
    beliefBased: TpbConstructScore | null;
    direct: TpbConstructScore | null;
  };
  intention: TpbConstructScore | null;
}

function assertRating(value: number, label: string): void {
  if (
    !Number.isInteger(value)
    || value < TPB_RESPONSE_SCALE.min
    || value > TPB_RESPONSE_SCALE.max
  ) {
    throw new RangeError(
      `${label} must be an integer from ${TPB_RESPONSE_SCALE.min} to ${TPB_RESPONSE_SCALE.max}.`,
    );
  }
}

function meanScore(
  values: readonly number[],
  min: number,
  max: number,
  label: string,
): TpbConstructScore | null {
  if (values.length === 0) return null;
  values.forEach((value, index) => assertRating(value, `${label}[${index}]`));
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    itemCount: values.length,
    sum,
    mean: sum / values.length,
    itemMin: min,
    itemMax: max,
  };
}

function beliefProductScore(
  pairs: readonly { belief: number; second: number }[] | undefined,
  label: string,
): TpbConstructScore | null {
  if (!pairs || pairs.length === 0) return null;
  const products = pairs.map(({ belief, second }, index) => {
    assertRating(belief, `${label}[${index}].belief`);
    assertRating(second, `${label}[${index}].evaluation`);
    return belief * second;
  });
  const sum = products.reduce((total, product) => total + product, 0);
  return {
    itemCount: products.length,
    sum,
    mean: sum / products.length,
    itemMin: TPB_RESPONSE_SCALE.min ** 2,
    itemMax: TPB_RESPONSE_SCALE.max ** 2,
  };
}

export function reverseTpbRating(
  rating: number,
  min: number = TPB_RESPONSE_SCALE.min,
  max: number = TPB_RESPONSE_SCALE.max,
): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max) {
    throw new RangeError("The reverse-scoring scale must have integer bounds with min below max.");
  }
  if (!Number.isInteger(rating) || rating < min || rating > max) {
    throw new RangeError(`Rating must be an integer from ${min} to ${max}.`);
  }
  return min + max - rating;
}

export function calculateTpb(input: TpbCalculationInput): TpbCalculation {
  return {
    attitude: {
      beliefBased: beliefProductScore(
        input.attitudeBeliefs?.map(({ belief, evaluation }) => ({ belief, second: evaluation })),
        "attitudeBeliefs",
      ),
      direct: meanScore(
        input.directAttitude ?? [],
        TPB_RESPONSE_SCALE.min,
        TPB_RESPONSE_SCALE.max,
        "directAttitude",
      ),
    },
    subjectiveNorm: {
      beliefBased: beliefProductScore(
        input.normativeBeliefs?.map(({ belief, motivationToComply }) => ({
          belief,
          second: motivationToComply,
        })),
        "normativeBeliefs",
      ),
      direct: meanScore(
        input.directSubjectiveNorm ?? [],
        TPB_RESPONSE_SCALE.min,
        TPB_RESPONSE_SCALE.max,
        "directSubjectiveNorm",
      ),
    },
    perceivedControl: {
      beliefBased: beliefProductScore(
        input.controlBeliefs?.map(({ belief, perceivedPower }) => ({
          belief,
          second: perceivedPower,
        })),
        "controlBeliefs",
      ),
      direct: meanScore(
        input.directPerceivedControl ?? [],
        TPB_RESPONSE_SCALE.min,
        TPB_RESPONSE_SCALE.max,
        "directPerceivedControl",
      ),
    },
    intention: meanScore(
      input.intention ?? [],
      TPB_RESPONSE_SCALE.min,
      TPB_RESPONSE_SCALE.max,
      "intention",
    ),
  };
}
