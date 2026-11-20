import type { Question } from "../../data/questionnaire";

const syntheticTpbResponses = {
  behavioralBeliefs: "Eating healthy meals can improve my health and energy.",
  outcomeEvaluations: "Better health and more energy are very important to me.",
  attitude: "I feel positive about eating healthy meals.",
  normativeBeliefs: "My family and friends support me eating healthy meals.",
  motivationToComply: "I value their opinions and want to follow their encouragement.",
  subjectiveNorm: "People important to me encourage me to eat healthy meals.",
  controlBeliefs: "Time, money, and availability can make healthy meals difficult.",
  perceivedPower: "I can usually overcome obstacles to eating healthy meals.",
  perceivedControl: "I feel confident in my ability to eat healthy meals.",
} as const;

export function getTpbScoringTestResponse(question: Question): string {
  if (question.construct !== "intention") {
    return syntheticTpbResponses[question.construct];
  }

  const phrase = question.keywords[100].find(
    (candidate) => candidate.trim().split(/\s+/).length > 1,
  );
  if (!phrase) {
    throw new Error(`The intention question ${question.id} has no usable test phrase.`);
  }
  return `${phrase} because I want to improve my health.`;
}
