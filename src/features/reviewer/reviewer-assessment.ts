import { QUESTIONS, type Construct, type Question, type ScoreBand } from "../../data/questionnaire";
import {
  PILOT_ADDITIONAL_QUESTIONS,
  PILOT_TTM_QUESTIONS,
} from "../../data/pilot-survey-questions";
import {
  calculateProfile,
  type Answer,
  type Profile,
} from "../assessment/scoring";

export interface ReviewerQuestionAnswer {
  questionId: string;
  questionNumber: number;
  section: string | null;
  prompt: string | null;
  response: string | null;
  score: ScoreBand | null;
  tpbModelRating?: number | null;
}

export const REVIEWER_CONSTRUCT_GROUPS = [
  { construct: "attitude", label: "Attitude", sectionsLabel: "Sections 1–3", firstSection: 1, lastSection: 3 },
  { construct: "subjectiveNorm", label: "Subjective norms", sectionsLabel: "Sections 4–6", firstSection: 4, lastSection: 6 },
  { construct: "perceivedControl", label: "Perceived behavioral control (PBC)", sectionsLabel: "Sections 7–9", firstSection: 7, lastSection: 9 },
] as const satisfies readonly {
  construct: Exclude<Construct, "intention">;
  label: string;
  sectionsLabel: string;
  firstSection: number;
  lastSection: number;
}[];

export type ReviewerProfileSummary = Pick<Profile, "stage" | "weakest" | "answered" | "total">;

const QUESTION_BY_ID = new Map(QUESTIONS.map((question) => [question.id, question]));
const PILOT_TTM_BY_ID = new Map(PILOT_TTM_QUESTIONS.map((question) => [question.id, question]));
const PILOT_ADDITIONAL_BY_ID = new Map(PILOT_ADDITIONAL_QUESTIONS.map((question) => [question.id, question]));

export function calculateReviewerProfile(
  questionOrder: readonly string[],
  answers: readonly Answer[],
): Profile | null {
  const questions: Question[] = [];
  let matchedAny = false;
  for (const questionId of questionOrder) {
    const question = QUESTION_BY_ID.get(questionId);
    if (!question) continue;
    matchedAny = true;
    questions.push(question);
  }
  if (!matchedAny) return null;
  return calculateProfile(questions, [...answers]);
}

export function summarizeReviewerProfile(profile: Profile | null): ReviewerProfileSummary | null {
  if (!profile) return null;
  return {
    stage: profile.stage,
    weakest: profile.weakest,
    answered: profile.answered,
    total: profile.total,
  };
}

export function getReviewerQuestionAnswers(
  questionOrder: readonly string[],
  answers: readonly Answer[],
): ReviewerQuestionAnswer[] {
  const answerById = new Map(answers.map((answer) => [answer.questionId, answer]));

  return questionOrder.map((questionId, index) => {
    const answer = answerById.get(questionId);
    const question = QUESTION_BY_ID.get(questionId);
    const ttmQuestion = PILOT_TTM_BY_ID.get(questionId);
    const additionalQuestion = PILOT_ADDITIONAL_BY_ID.get(questionId);
    const dependencyAnswer = ttmQuestion?.dependsOn
      ? answerById.get(`pilot-ttm-${String(ttmQuestion.dependsOn.questionNumber).padStart(2, "0")}`)
      : undefined;
    let notAsked = ttmQuestion?.dependsOn
      && dependencyAnswer?.response !== null
      && dependencyAnswer?.response !== undefined
      && dependencyAnswer.response.trim().toLowerCase() !== (ttmQuestion.dependsOn.answer ? "yes" : "no");
    const dependencyQuestion = ttmQuestion?.dependsOn
      ? PILOT_TTM_BY_ID.get(`pilot-ttm-${String(ttmQuestion.dependsOn.questionNumber).padStart(2, "0")}`)
      : undefined;
    if (dependencyQuestion?.dependsOn) {
      const ancestorResponse = answerById.get(
        `pilot-ttm-${String(dependencyQuestion.dependsOn.questionNumber).padStart(2, "0")}`,
      )?.response?.trim().toLowerCase();
      if (
        ancestorResponse !== undefined &&
        ancestorResponse !== (dependencyQuestion.dependsOn.answer ? "yes" : "no")
      ) notAsked = true;
    }
    return {
      questionId,
      questionNumber: index + 1,
      section: question?.section
        ?? (ttmQuestion ? "Part B: Stage of Change" : null)
        ?? (additionalQuestion ? "Part C: Additional Questions" : null),
      prompt: question?.prompt ?? ttmQuestion?.prompt ?? additionalQuestion?.prompt ?? null,
      response: notAsked ? "Not asked (conditional)" : answer?.response ?? null,
      score: answer?.score ?? null,
      ...(answer?.tpbModelRating !== undefined
        ? { tpbModelRating: answer.tpbModelRating }
        : {}),
    };
  });
}

export function groupReviewerQuestionAnswers(questionAnswers: readonly ReviewerQuestionAnswer[]) {
  const groups = REVIEWER_CONSTRUCT_GROUPS.map((group) => ({
    ...group,
    answers: [] as ReviewerQuestionAnswer[],
  }));
  const otherAnswers: ReviewerQuestionAnswer[] = [];

  for (const answer of questionAnswers) {
    const sectionNumber = Number(/^Section (\d+):/.exec(answer.section ?? "")?.[1]);
    if (!Number.isInteger(sectionNumber)) {
      otherAnswers.push(answer);
      continue;
    }
    if (sectionNumber === 10) continue;

    const group = groups.find(({ firstSection, lastSection }) =>
      sectionNumber >= firstSection && sectionNumber <= lastSection,
    );
    if (group) group.answers.push(answer);
    else otherAnswers.push(answer);
  }

  if (otherAnswers.length > 0) {
    return [
      ...groups,
      {
        construct: "other" as const,
        label: "Other questions",
        sectionsLabel: "Unmapped sections",
        firstSection: 0,
        lastSection: 0,
        answers: otherAnswers,
      },
    ];
  }
  return groups;
}
