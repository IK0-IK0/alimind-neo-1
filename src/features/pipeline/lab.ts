import { QUESTIONS, type Question, type ScoreBand } from "../../data/questionnaire";
import { makeAnswer, scoreResponse } from "../assessment/scoring";
import type { Answer } from "../assessment/scoring";

export type PipelineLabFactor = "attitude" | "subjectiveNorm" | "perceivedControl";

function responseFor(question: Question, score: ScoreBand): string {
  const phrase = question.keywords[score].find((candidate) => scoreResponse(question, candidate) === score);
  if (!phrase) throw new Error(`Question "${question.id}" has no unambiguous example phrase for score ${score}.`);
  return phrase;
}

export function createPipelineScenario(weakest: PipelineLabFactor): Record<string, string> {
  return Object.fromEntries(QUESTIONS.filter((question) => question.construct !== "intention").map((question) => {
    const score: ScoreBand = question.construct === weakest ? 25 : 75;
    return [question.id, responseFor(question, score)];
  }));
}

export function createPipelineAnswers(responses: Record<string, string>): Answer[] {
  return QUESTIONS.filter((question) => question.construct !== "intention").flatMap((question) => {
    const response = responses[question.id]?.trim();
    return response ? [makeAnswer(question, response)] : [];
  });
}

export const PIPELINE_LAB_FACTORS: PipelineLabFactor[] = [
  "attitude",
  "subjectiveNorm",
  "perceivedControl",
];
