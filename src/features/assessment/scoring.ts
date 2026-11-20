import type { Construct, Question, ScoreBand } from "../../data/questionnaire";

export type Answer = {
  questionId: string;
  response: string | null;
  score: ScoreBand | null;
  tpbModelRating?: number | null;
};

export interface Profile {
  scores: Partial<Record<Exclude<Construct, "intention">, number>>;
  readiness: number | null;
  stage: TTMStage | null;
  weakest: "attitude" | "subjectiveNorm" | "perceivedControl" | null;
  answered: number;
  total: number;
}

export type TTMStage =
  | "Pre-contemplation"
  | "Contemplation"
  | "Preparation"
  | "Action"
  | "Maintenance";

const STAGES: TTMStage[] = [
  "Pre-contemplation",
  "Contemplation",
  "Preparation",
  "Action",
  "Maintenance",
];
const MINIMUM_CONSTRUCT_COVERAGE = 3;
const TPB_RATING_MIN = 1;
const TPB_RATING_MAX = 7;

const constructOrder = [
  "attitude",
  "subjectiveNorm",
  "perceivedControl",
] as const;

const normalize = (text: string) =>
  text.toLocaleLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}']+/gu, " ").trim();
const NEGATIONS = new Set(["not", "no", "never", "without", "cannot", "can't", "don't", "doesn't", "isn't", "aren't", "won't"]);

function matchesPhrase(text: string, phrase: string): boolean {
  const needle = normalize(phrase);
  if (!needle) return false;
  const paddedNeedle = ` ${needle} `;
  let index = text.indexOf(paddedNeedle);
  while (index !== -1) {
    const prefix = text.slice(0, index).trim();
    const words = prefix.split(/\s+/);
    const precedingWord = words[words.length - 1];
    if (!precedingWord || !NEGATIONS.has(precedingWord) || NEGATIONS.has(needle.split(" ")[0])) {
      return true;
    }
    index = text.indexOf(paddedNeedle, index + 1);
  }
  return false;
}

export function scoreResponse(question: Question, response: string): ScoreBand | null {
  const text = ` ${normalize(response)} `;
  if (!text.trim() || text.trim().split(/\s+/).length < 2) return null;

  const hits = new Map<ScoreBand, number>();
  for (const band of [0, 25, 50, 75, 100] as const) {
    let count = 0;
    for (const phrase of question.keywords[band]) {
      if (matchesPhrase(text, phrase)) count += 1;
    }
    hits.set(band, count);
  }

  let best: ScoreBand | null = null;
  let bestCount = 0;
  for (const band of [100, 75, 50, 25, 0] as const) {
    const count = hits.get(band) ?? 0;
    if (count > bestCount) {
      best = band;
      bestCount = count;
    }
  }
  return best;
}

export function calculateProfile(questions: Question[], answers: Answer[]): Profile {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer]));
  const scoreable = questions.flatMap((item) => {
    const answer = byId.get(item.id);
    const modelRating = item.construct === "intention" ? null : answer?.tpbModelRating;
    if (modelRating !== null && modelRating !== undefined
      && (!Number.isFinite(modelRating) || modelRating < TPB_RATING_MIN || modelRating > TPB_RATING_MAX)) {
      throw new RangeError("A TPB model rating must be between 1 and 7.");
    }
    const score = modelRating === null || modelRating === undefined
      ? answer?.score
      : ((modelRating - TPB_RATING_MIN) / (TPB_RATING_MAX - TPB_RATING_MIN)) * 100;
    return score === null || score === undefined
      ? []
      : [{ construct: item.construct, score }];
  });

  const scores: Profile["scores"] = {};
  for (const construct of constructOrder) {
    const items = scoreable.filter((answer) => answer.construct === construct);
    if (items.length >= MINIMUM_CONSTRUCT_COVERAGE) {
      scores[construct] = Math.round(
        items.reduce((sum, item) => sum + item.score, 0) / items.length,
      );
    }
  }

  const readinessScores = scoreable
    .filter((answer) => answer.construct === "intention")
    .map((answer) => Math.round(answer.score / 25));
  const readiness = readinessScores.length >= MINIMUM_CONSTRUCT_COVERAGE
    ? Math.round(readinessScores.reduce((sum, score) => sum + score, 0) / readinessScores.length)
    : null;
  const sortedScores = constructOrder
    .filter((construct) => scores[construct] !== undefined)
    .map((construct) => ({ construct, score: scores[construct]! }));
  const weakest = sortedScores.length
    ? sortedScores.reduce((lowest, item) => (item.score < lowest.score ? item : lowest)).construct
    : null;

  return {
    scores,
    readiness,
    stage: readiness === null ? null : STAGES[readiness],
    weakest,
    answered: answers.length,
    total: questions.length,
  };
}

export function shuffleQuestions<T>(items: readonly T[], random = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function makeAnswer(question: Question, response: string): Answer {
  const isSkipped = /^(skip|prefer not to answer|pass)$/i.test(response.trim());
  return {
    questionId: question.id,
    response: response.trim() && !isSkipped ? response.trim() : null,
    score: response.trim() && !isSkipped ? scoreResponse(question, response) : null,
  };
}
