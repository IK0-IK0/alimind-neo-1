import type { Profile, TTMStage } from "../assessment/scoring";

type Factor = NonNullable<Profile["weakest"]>;

const BCT: Record<TTMStage, Record<Factor, string>> = {
  "Pre-contemplation": {
    attitude: "Information about health consequences",
    subjectiveNorm: "Learning from positive examples",
    perceivedControl: "Encouragement about your capabilities",
  },
  Contemplation: {
    attitude: "Exploring the pros and cons",
    subjectiveNorm: "Finding supportive people",
    perceivedControl: "Reframing the barriers",
  },
  Preparation: {
    attitude: "Noticing the benefits around you",
    subjectiveNorm: "Asking for practical support",
    perceivedControl: "Making a small action plan",
  },
  Action: {
    attitude: "Celebrating meaningful progress",
    subjectiveNorm: "Getting encouragement from others",
    perceivedControl: "Learning practical skills",
  },
  Maintenance: {
    attitude: "Rewarding yourself for consistency",
    subjectiveNorm: "Finding encouragement in your community",
    perceivedControl: "Planning for challenges",
  },
};

const NEXT_STEP: Record<Factor, string> = {
  attitude: "Choose one nourishing Filipino meal you already enjoy, and notice how it makes you feel.",
  subjectiveNorm: "Invite someone you trust to share one balanced meal with you this week.",
  perceivedControl: "Pick one low-effort change that fits your time and budget, like adding a vegetable to a familiar meal.",
};

export function selectBCT(stage: TTMStage, factor: Factor): string {
  return BCT[stage][factor];
}

export function getNextStep(factor: Factor): string {
  return NEXT_STEP[factor];
}

export function getStageDescription(stage: TTMStage): string {
  const descriptions: Record<TTMStage, string> = {
    "Pre-contemplation": "You may not be looking to change right now. That's okay—curiosity is a gentle place to begin.",
    Contemplation: "You're considering a change and weighing what could work for you.",
    Preparation: "You're getting ready. A small, realistic plan can make starting easier.",
    Action: "You're already taking steps. Keep choosing changes that feel sustainable.",
    Maintenance: "You've been building consistency. Flexibility can help your habits last.",
  };
  return descriptions[stage];
}
