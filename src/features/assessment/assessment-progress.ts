import { PILOT_TTM_QUESTIONS } from "../../data/pilot-survey-questions";
import type { Answer } from "./scoring";

export function getApplicableQuestionCount(questionOrder: readonly string[], answers: readonly Answer[]) {
  const answerById = new Map(answers.map((answer) => [answer.questionId, answer]));
  return questionOrder.filter((questionId) => {
    const question = PILOT_TTM_QUESTIONS.find((item) => item.id === questionId);
    const dependency = question?.dependsOn;
    if (!dependency) return true;
    const dependencyId = `pilot-ttm-${String(dependency.questionNumber).padStart(2, "0")}`;
    const dependencyQuestion = PILOT_TTM_QUESTIONS.find((item) => item.id === dependencyId);
    if (dependencyQuestion?.dependsOn) {
      const ancestorId = `pilot-ttm-${String(dependencyQuestion.dependsOn.questionNumber).padStart(2, "0")}`;
      const ancestorResponse = answerById.get(ancestorId)?.response?.trim().toLowerCase();
      if (
        ancestorResponse !== undefined &&
        ancestorResponse !== (dependencyQuestion.dependsOn.answer ? "yes" : "no")
      ) return false;
    }
    const response = answerById.get(dependencyId)?.response?.trim().toLowerCase();
    return response === undefined || response === (dependency.answer ? "yes" : "no");
  }).length;
}
