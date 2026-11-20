import { calculateTpb, type TpbCalculation } from "../assessment/tpb-calculation";
import {
  PILOT_ADDITIONAL_QUESTIONS,
  PILOT_TPB_QUESTIONS,
} from "../../data/pilot-survey-questions";
import type { TTMStage } from "../assessment/scoring";
import { classifyTtmStage, createTtmScenarioAnswers } from "../pipeline/ttm";

export interface SampleAdditionalResponse {
  value: string | string[];
  followUp?: string;
}

export interface SampleCase {
  id: string;
  set: "A" | "B";
  participant: string;
  submitted: string;
  progress: string;
  proposedScore: number;
  pilotTpbResponses: Record<string, string>;
  pilotTtmResponses: Record<number, boolean | null>;
  additionalResponses: Record<string, SampleAdditionalResponse>;
  tpbScores: TpbCalculation;
  ttmResult: ReturnType<typeof classifyTtmStage>;
}

const SET_A_SCORES = [
  6, 5, 6, 5, 6,
  6, 5, 4, 4,
  7, 6, 2, 3,
  5, 6, 5, 4,
  6, 5, 6,
  6, 4, 5,
  5, 4, 4, 5,
  6, 4, 5, 4,
  5, 3, 4, 6,
  6, 5, 6,
] as const;

const SET_B_SCORES = [
  3, 4, 3, 2, 4,
  4, 3, 2, 2,
  5, 5, 3, 2,
  3, 2, 4, 3,
  3, 2, 4,
  4, 3, 5,
  3, 4, 2, 3,
  3, 4, 2, 3,
  2, 3, 3, 2,
  3, 4, 2,
] as const;

const SAMPLE_PILOT_TPB_RESPONSES: Record<"A" | "B", Record<string, string>> = {
  A: {
    "Behavioral Beliefs": "I think nutritious meals could improve my health, energy, digestion, and focus. Cost and planning are the main obstacles.",
    "Outcome Evaluations": "Health and energy matter a lot to me. I want meals to stay enjoyable and affordable too.",
    "Attitude Toward the Behavior": "Overall, I see it as worthwhile if I can keep meals practical and include foods I enjoy.",
    "Normative Beliefs": "My family and health professionals are supportive; friends have mixed habits.",
    "Motivation to Comply": "I consider advice from family and health professionals, but I want choices that fit my routine.",
    "Subjective Norm": "People close to me would mostly support it, though I do not feel strong pressure from them.",
    "Control Beliefs": "Budget, time, a kitchen, and cooking confidence affect whether I can do this.",
    "Perceived Power": "Having a grocery budget and a meal plan would make it easier; time may still be tight.",
    "Perceived Behavioral Control": "I feel capable on most days when I plan ahead, but busy periods can get in the way.",
  },
  B: {
    "Behavioral Beliefs": "Nutritious meals may help my health, but I am unsure how much difference they would make with my schedule and budget.",
    "Outcome Evaluations": "Health matters to me, though I also value convenience, familiar foods, and eating with friends.",
    "Attitude Toward the Behavior": "I see some benefits, but the effort and cost would need to feel manageable.",
    "Normative Beliefs": "Some family members encourage healthier meals; my friends have a range of eating habits.",
    "Motivation to Comply": "I listen to people I trust, but I make my own decisions when advice does not fit my circumstances.",
    "Subjective Norm": "I get mixed signals from people around me and do not feel much expectation to change.",
    "Control Beliefs": "Money, nearby food options, time, and cooking facilities shape what I can manage.",
    "Perceived Power": "A lower-cost meal plan and convenient ingredients would help, but busy weeks would remain difficult.",
    "Perceived Behavioral Control": "I am not yet sure I could keep this up consistently without more time and affordable options.",
  },
};

const SAMPLE_ADDITIONAL_RESPONSES: Record<"A" | "B", Record<string, SampleAdditionalResponse>> = {
  A: {
    "pilot-additional-67": { value: "20" },
    "pilot-additional-68": { value: "Somewhat reliable (occasional issues)" },
    "pilot-additional-69": { value: "No" },
    "pilot-additional-70": { value: ["None"] },
    "pilot-additional-71": { value: "Full kitchen" },
    "pilot-additional-72": { value: "2–3 times per week" },
  },
  B: {
    "pilot-additional-67": { value: "22" },
    "pilot-additional-68": { value: "Very reliable (rarely have connectivity issues)" },
    "pilot-additional-69": { value: "Yes", followUp: "A food-tracking app, for a short period." },
    "pilot-additional-70": { value: ["Vegetarian"], followUp: "No other restrictions." },
    "pilot-additional-71": { value: "Limited cooking facilities (such as a rice cooker, hot plate, or electric kettle)" },
    "pilot-additional-72": { value: "Once a week or less" },
  },
};

function calculateSampleScores(scores: readonly number[]): TpbCalculation {
  const score = (questionNumber: number) => scores[questionNumber - 1];

  return calculateTpb({
    attitudeBeliefs: [6, 7, 8, 9].map((beliefQuestion, index) => ({
      belief: score(beliefQuestion),
      evaluation: score(10 + index),
    })),
    directSubjectiveNorm: [14, 15, 16, 17].map(score),
    normativeBeliefs: [18, 19, 20].map((beliefQuestion, index) => ({
      belief: score(beliefQuestion),
      motivationToComply: score(21 + index),
    })),
    directPerceivedControl: [24, 25, 26, 27].map(score),
    controlBeliefs: [28, 29, 30, 31].map((beliefQuestion, index) => ({
      belief: score(beliefQuestion),
      perceivedPower: score(32 + index),
    })),
    intention: [36, 37, 38].map(score),
  });
}

function createSampleCase({
  id,
  set,
  participant,
  submitted,
  scores,
  stage,
}: {
  id: string;
  set: "A" | "B";
  participant: string;
  submitted: string;
  scores: readonly number[];
  stage: TTMStage;
}): SampleCase {
  const ttmAnswers = createTtmScenarioAnswers(stage);
  const pilotTtmResponses: Record<number, boolean | null> = {
    63: ttmAnswers.currentlyFollowingHealthyPattern,
    64: ttmAnswers.followingForMoreThanOneMonth,
    65: ttmAnswers.intendsToStartWithinOneMonth,
    66: ttmAnswers.intendsToStartWithinOneWeek,
  };

  return {
    id,
    set,
    participant,
    submitted,
    progress: "Pilot survey complete",
    proposedScore: scores[0],
    pilotTpbResponses: Object.fromEntries(
      PILOT_TPB_QUESTIONS.map((question) => [
        question.id,
        SAMPLE_PILOT_TPB_RESPONSES[set][question.section],
      ]),
    ),
    pilotTtmResponses,
    additionalResponses: Object.fromEntries(
      PILOT_ADDITIONAL_QUESTIONS.map((question) => [
        question.id,
        SAMPLE_ADDITIONAL_RESPONSES[set][question.id],
      ]),
    ),
    tpbScores: calculateSampleScores(scores),
    ttmResult: classifyTtmStage(ttmAnswers),
  };
}

export const SAMPLE_CASES: SampleCase[] = [
  createSampleCase({
    id: "SAMPLE-1042",
    set: "A",
    participant: "Sample participant A",
    submitted: "Today · 9:42 AM",
    scores: SET_A_SCORES,
    stage: "Preparation",
  }),
  createSampleCase({
    id: "SAMPLE-1038",
    set: "B",
    participant: "Sample participant B",
    submitted: "Yesterday · 3:18 PM",
    scores: SET_B_SCORES,
    stage: "Contemplation",
  }),
];
