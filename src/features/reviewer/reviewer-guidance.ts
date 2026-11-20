import type { TTMStage } from "../assessment/scoring";
import type { Profile } from "../assessment/scoring";
import type { TpbConstructScore } from "../assessment/tpb-calculation";
import type { SampleCase } from "./reviewer-sample-data";

type TpbConstruct = "Attitude" | "Subjective norm" | "Perceived control" | "Intention";
type TpbMeasure = "belief-based composite" | "direct measure";

interface TpbSignal {
  construct: TpbConstruct;
  measure: TpbMeasure;
  normalizedValue: number;
}

export interface ReviewerGuidance {
  response: string;
  recommendation: string;
  lowestTpbSignal: string;
}

const PROFILE_CONSTRUCT: Record<NonNullable<Profile["weakest"]>, TpbConstruct> = {
  attitude: "Attitude",
  subjectiveNorm: "Subjective norm",
  perceivedControl: "Perceived control",
};

const STAGE_RESPONSE: Record<TTMStage, string> = {
  "Pre-contemplation": "There is no pressure to change everything at once; we can start by exploring what feels worthwhile to you.",
  Contemplation: "It makes sense to weigh the benefits and barriers while you consider a change.",
  Preparation: "You are preparing to begin soon, so a manageable first step can help turn that plan into action.",
  Action: "You are already taking action; recognizing what is working can help you keep building on it.",
  Maintenance: "You have been maintaining this pattern; noticing what helps can support you through future challenges.",
};

const STAGE_RECOMMENDATION: Record<TTMStage, string> = {
  "Pre-contemplation": "For now, explore one benefit or concern that matters to you; no commitment is needed.",
  Contemplation: "When you feel ready, try one small change once and notice how it fits your routine.",
  Preparation: "Before this week, choose one specific meal to plan as your first step.",
  Action: "Keep one part of your current routine that works and make a backup plan for a likely barrier.",
  Maintenance: "Choose one strategy that has helped you stay consistent and a backup for a likely disruption.",
};

const FOCUS_RESPONSE: Record<TpbConstruct, string> = {
  Attitude: "Focusing on a benefit that feels personally meaningful may make the change more worthwhile.",
  "Subjective norm": "Support from someone you trust may help if you would find it useful.",
  "Perceived control": "Let's make the next step easier to fit your time, budget, and access.",
  Intention: "A clear, realistic first step may help when you are ready to act.",
};

const FOCUS_RECOMMENDATION: Record<TpbConstruct, string> = {
  Attitude: "Choose one outcome you value and try a small change that could support it.",
  "Subjective norm": "If helpful, invite one supportive person to encourage or join that meal choice.",
  "Perceived control": "Keep it affordable and easy to find, and choose a backup for busy days.",
  Intention: "Pick a day and time for one realistic first step.",
};

export function getReviewerGuidance(sampleCase: SampleCase): ReviewerGuidance {
  const lowestSignal = getLowestTpbSignal(sampleCase);
  const stage = sampleCase.ttmResult.status === "classified" ? sampleCase.ttmResult.stage : null;

  return buildGuidance(
    stage,
    lowestSignal?.construct ?? null,
    lowestSignal ? `${lowestSignal.construct} · ${lowestSignal.measure}` : "Not available",
    !stage ? "The stage screening is incomplete." : "",
    !stage ? "Complete the stage screening before choosing a stage-specific next step." : "",
  );
}

export function getReviewerGuidanceFromProfile(profile: Profile): ReviewerGuidance {
  const weakest = profile.weakest ? PROFILE_CONSTRUCT[profile.weakest] : null;
  const stageMessage = profile.stage
    ? STAGE_RESPONSE[profile.stage]
    : "There are not enough matched intention responses to estimate a readiness stage.";
  const stageRecommendation = profile.stage
    ? STAGE_RECOMMENDATION[profile.stage]
    : "Review the conversation and write a practical next step that fits the participant's context.";

  return buildGuidance(
    profile.stage,
    weakest,
    weakest ? `${weakest} · experimental model estimate` : "No supported TPB estimate",
    profile.stage ? "" : stageMessage,
    profile.stage ? "" : stageRecommendation,
  );
}

function buildGuidance(
  stage: TTMStage | null,
  construct: TpbConstruct | null,
  signalLabel: string,
  unavailableStageResponse: string,
  unavailableStageRecommendation: string,
): ReviewerGuidance {
  const stageResponse = stage ? STAGE_RESPONSE[stage] : unavailableStageResponse;
  const stageRecommendation = stage ? STAGE_RECOMMENDATION[stage] : unavailableStageRecommendation;
  const focusResponse = construct ? FOCUS_RESPONSE[construct] : "";
  const focusRecommendation = construct ? FOCUS_RECOMMENDATION[construct] : "";

  return {
    response: [stageResponse, focusResponse].filter(Boolean).join(" "),
    recommendation: [stageRecommendation, focusRecommendation].filter(Boolean).join(" "),
    lowestTpbSignal: signalLabel,
  };
}

function getLowestTpbSignal(sampleCase: SampleCase): TpbSignal | null {
  const signals: TpbSignal[] = [];
  addSignal(signals, "Attitude", "belief-based composite", sampleCase.tpbScores.attitude.beliefBased);
  addSignal(signals, "Subjective norm", "belief-based composite", sampleCase.tpbScores.subjectiveNorm.beliefBased);
  addSignal(signals, "Subjective norm", "direct measure", sampleCase.tpbScores.subjectiveNorm.direct);
  addSignal(signals, "Perceived control", "belief-based composite", sampleCase.tpbScores.perceivedControl.beliefBased);
  addSignal(signals, "Perceived control", "direct measure", sampleCase.tpbScores.perceivedControl.direct);
  addSignal(signals, "Intention", "direct measure", sampleCase.tpbScores.intention);

  const lowest = signals.reduce<TpbSignal | null>(
    (current, signal) => current === null || signal.normalizedValue < current.normalizedValue ? signal : current,
    null,
  );
  return lowest;
}

function addSignal(
  signals: TpbSignal[],
  construct: TpbConstruct,
  measure: TpbMeasure,
  score: TpbConstructScore | null,
): void {
  if (!score) return;
  const range = score.itemMax - score.itemMin;
  signals.push({
    construct,
    measure,
    normalizedValue: range > 0 ? (score.mean - score.itemMin) / range : 0,
  });
}
