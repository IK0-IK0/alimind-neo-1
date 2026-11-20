import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Beaker, Check, LoaderCircle, Play, Sprout } from "lucide-react";
import {
  TPB_FREE_TEXT_QUESTION_COUNT,
  TPB_FREE_TEXT_SECTIONS,
} from "../assessment/tpb-free-text-questionnaire";
import { TPB_INFERENCE_MODEL } from "../assessment/tpb-inference-model";
import type { TpbQ1ExperimentResult } from "../assessment/tpb-q1-experiment";
import { RecipeFinder } from "../recipes/RecipeFinder";
import { apiRequest } from "../../lib/api";
import {
  classifyTtmStage,
  EMPTY_TTM_SCREENING_ANSWERS,
  type TtmScreeningAnswers,
  type YesNoAnswer,
} from "./ttm";
import {
  canPublishHumanResult,
  confirmQ1Proposal,
  formatHumanReviewDecision,
  markQ1Unscorable,
  overrideQ1Score,
  PENDING_Q1_REVIEW,
  type Q1ScoreReview,
} from "./human-review";
import { Badge, Button, Card } from "../../components/ui/primitives";

type StepResult = {
  status: "passed" | "blocked" | "unavailable" | "loading";
  output: string;
};

const STEPS = [
  { id: 1, title: "Context Collection", summary: "Collect free-text TPB responses and healthy-eating TTM screening answers." },
  { id: 2, title: "TPB Score Proposal", summary: "The local model proposes a Q1 score only; its current output is synthetic-only and not ready for participants." },
  { id: 3, title: "TTM Screening Context", summary: "Show the deterministic screening classification as context, not an automatic intervention choice." },
  { id: 4, title: "Human Score Review", summary: "A human reviewer confirms, corrects with a reason, or marks the proposal unscorable." },
  { id: 5, title: "Human Response and Recommendation", summary: "A human writes, previews, and explicitly publishes both fields; no text is generated from scores." },
] as const;

const TPB_Q1 = (() => {
  const question = TPB_FREE_TEXT_SECTIONS.flatMap((section) => section.questions)
    .find((item) => item.id === "tpb-01");
  if (!question) {
    throw new Error("The fixed TPB inference test requires question tpb-01.");
  }
  return question;
})();

function resultTone(status: StepResult["status"]) {
  if (status === "passed") return "pipeline-status-passed";
  if (status === "loading") return "pipeline-status-loading";
  if (status === "blocked") return "pipeline-status-blocked";
  return "pipeline-status-unavailable";
}

function TtmYesNoQuestion({
  id,
  legend,
  value,
  onChange,
}: {
  id: string;
  legend: string;
  value: YesNoAnswer;
  onChange: (value: boolean) => void;
}) {
  return (
    <fieldset className="pipeline-ttm-question">
      <legend>{legend}</legend>
      {([true, false] as const).map((answer) => (
        <label key={String(answer)}>
          <input
            type="radio"
            name={id}
            checked={value === answer}
            onChange={() => onChange(answer)}
          />
          {answer ? "Yes" : "No"}
        </label>
      ))}
    </fieldset>
  );
}

export default function PipelineLabPage() {
  const [tpbResponses, setTpbResponses] = useState<Record<string, string>>({});
  const [contextMessage, setContextMessage] = useState("");
  const [ttmAnswers, setTtmAnswers] = useState<TtmScreeningAnswers>(EMPTY_TTM_SCREENING_ANSWERS);
  const [results, setResults] = useState<Record<number, StepResult>>({});
  const [q1Experiment, setQ1Experiment] = useState<TpbQ1ExperimentResult | null>(null);
  const [q1ExperimentError, setQ1ExperimentError] = useState<string | null>(null);
  const [isRunningQ1Experiment, setIsRunningQ1Experiment] = useState(false);
  const [q1Review, setQ1Review] = useState<Q1ScoreReview>(PENDING_Q1_REVIEW);
  const [overrideScore, setOverrideScore] = useState("4");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [humanResponse, setHumanResponse] = useState("");
  const [humanRecommendation, setHumanRecommendation] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);

  function invalidateHumanWork() {
    setQ1Review(PENDING_Q1_REVIEW);
    setOverrideScore("4");
    setReviewReason("");
    setReviewError("");
    setHumanResponse("");
    setHumanRecommendation("");
    setIsPreviewing(false);
    setIsPublished(false);
    setResults({});
  }

  function runStep(stepId: number): StepResult {
    const classification = classifyTtmStage(ttmAnswers);
    if (stepId === 1) {
      if (ttmAnswers.currentlyFollowingHealthyPattern === null && !Object.values(tpbResponses).some((response) => response.trim())) {
        return { status: "blocked", output: classification.reason };
      }
      return {
        status: "passed",
        output: `Context collected: ${Object.values(tpbResponses).filter((response) => response.trim()).length} free-text TPB responses.${ttmAnswers.currentlyFollowingHealthyPattern !== null ? ` TTM screening answers captured.${classification.status === "incomplete" ? ` Next: ${classification.reason}` : ""}` : ""} ${contextMessage.trim() ? "The optional sample message is held in page memory but is not analyzed, sent, or stored." : ""}`,
      };
    }
    if (stepId === 2) {
      const completedFreeTextAnswers = Object.values(tpbResponses).filter((response) => response.trim()).length;
      return q1Experiment
        ? {
            status: "passed",
            output: `Score-only proposal ready for human review: ${q1Experiment.predictedScore}/7 for Q1. This is a synthetic-only lab demonstration, not a participant score.\n\nPart A responses provided: ${completedFreeTextAnswers}/${TPB_FREE_TEXT_QUESTION_COUNT}. The model only processes Q1; no other response is scored.`,
          }
        : {
            status: "blocked",
            output: `No score proposal is available yet. Enter a response for Q1 and run the local experiment. It only tests ${TPB_INFERENCE_MODEL.id} with synthetic reference data; it does not score the full TPB questionnaire.`,
          };
    }
    if (stepId === 3) {
      return classification.status === "classified"
        ? { status: "passed", output: `${classification.stage}\n\nDecision path: ${classification.reason}\n\nThis applies the supplied one-month and one-week cutoffs literally; conventional TTM time windows differ, so this is not a validated clinical classification.` }
        : {
            status: "blocked",
            output: `${classification.stage ? `Provisional current stage: ${classification.stage}.\n\n` : ""}${classification.reason}`,
          };
    }
    return { status: "blocked", output: "This step is completed through its human-review controls." };
  }

  function runOne(stepId: number) {
    const prerequisites: Record<number, number[]> = { 3: [1] };
    const unmetPrerequisites = prerequisites[stepId]?.filter(
      (prerequisite) => results[prerequisite]?.status !== "passed",
    ) ?? [];
    if (unmetPrerequisites.length > 0) {
      setResults((current) => ({
        ...current,
        [stepId]: { status: "blocked", output: `Run prerequisite step${unmetPrerequisites.length > 1 ? "s" : ""} ${unmetPrerequisites.join(" and ")} first.` },
      }));
      return;
    }
    setResults((current) => ({ ...current, [stepId]: runStep(stepId) }));
  }

  function runAll() {
    const contextResult = runStep(1);
    const tpbResult = runStep(2);
    const ttmResult = contextResult.status === "passed"
      ? runStep(3)
      : { status: "blocked" as const, output: "Complete Step 1 screening questions first." };
    setResults({
      1: contextResult,
      2: tpbResult,
      3: ttmResult,
      4: q1Review.status === "pending"
        ? { status: "blocked", output: "A human must explicitly confirm, correct, or mark the Q1 proposal unscorable." }
        : { status: "passed", output: formatHumanReviewDecision(q1Review) },
      5: isPublished
        ? { status: "passed", output: "Human-authored result published in this local lab preview only. Nothing was sent or saved." }
        : { status: "blocked", output: "A human decision and human-authored response and recommendation are required before publishing." },
    });
  }

  function updateTtmAnswer(key: keyof TtmScreeningAnswers, value: boolean) {
    setTtmAnswers((current) => ({ ...current, [key]: value }));
    invalidateHumanWork();
  }

  function updateTpbResponse(questionId: string, value: string) {
    setTpbResponses((current) => ({ ...current, [questionId]: value }));
    if (questionId === TPB_Q1.id) {
      setQ1Experiment(null);
      setQ1ExperimentError(null);
    }
    invalidateHumanWork();
  }

  function invalidateHumanDecision() {
    setQ1Review(PENDING_Q1_REVIEW);
    setReviewError("");
    setIsPublished(false);
    setIsPreviewing(false);
    setResults((current) => {
      const next = { ...current };
      delete next[4];
      delete next[5];
      return next;
    });
  }

  function updateReviewReason(value: string) {
    setReviewReason(value);
    setReviewError("");
    if (q1Review.status !== "pending") invalidateHumanDecision();
  }

  function updateOverrideScore(value: string) {
    setOverrideScore(value);
    setReviewError("");
    if (q1Review.status !== "pending") invalidateHumanDecision();
  }

  function updateHumanDraft(setValue: (value: string) => void, value: string) {
    setValue(value);
    setIsPublished(false);
    setIsPreviewing(false);
    setResults((current) => ({
      ...current,
      5: { status: "blocked", output: "Draft changed. Preview and publish it again when ready." },
    }));
  }

  async function runQ1BertExperiment() {
    setIsRunningQ1Experiment(true);
    setQ1Experiment(null);
    setQ1ExperimentError(null);
    invalidateHumanDecision();
    setHumanResponse("");
    setHumanRecommendation("");
    setResults((current) => {
      const next = { ...current };
      delete next[2];
      return next;
    });
    try {
      const result = await apiRequest<TpbQ1ExperimentResult>("/api/tpb/q1-experiment", {
        method: "POST",
        body: JSON.stringify({ response: tpbResponses[TPB_Q1.id] ?? "" }),
      });
      setQ1Experiment(result);
      setResults((current) => ({
        ...current,
        2: {
          status: "passed",
          output: `AI score proposal: ${result.predictedScore}/7 for Q1. This is a synthetic-only lab result and requires an explicit human decision; it must not be used as a participant score.`,
        },
      }));
    } catch (error) {
      setQ1ExperimentError(
        error instanceof Error ? error.message : "The local Python BERT experiment failed unexpectedly.",
      );
    } finally {
      setIsRunningQ1Experiment(false);
    }
  }

  const completedFreeTextAnswers = Object.values(tpbResponses).filter((response) => response.trim()).length;
  const canRunPipeline = completedFreeTextAnswers > 0 || Object.values(ttmAnswers).some((answer) => answer !== null);
  const liveTtmClassification = classifyTtmStage(ttmAnswers);
  const reviewCanPublish = canPublishHumanResult(q1Review, humanResponse, humanRecommendation);

  function recordHumanDecision(decision: Q1ScoreReview | null) {
    if (!decision) {
      setReviewError("Choose a score from 1–7 and enter a reason for a correction or unscorable decision.");
      return;
    }
    setReviewError("");
    setQ1Review(decision);
    setIsPreviewing(false);
    setIsPublished(false);
    setResults((current) => ({
      ...current,
      4: { status: "passed", output: formatHumanReviewDecision(decision) },
      5: { status: "blocked", output: "Write a human response and recommendation, then explicitly publish the preview." },
    }));
  }

  function previewHumanResult() {
    if (!reviewCanPublish) return;
    setIsPreviewing(true);
    setIsPublished(false);
  }

  function publishHumanResult() {
    if (!reviewCanPublish || !isPreviewing) return;
    setIsPublished(true);
    setResults((current) => ({
      ...current,
      5: { status: "passed", output: "Human-authored result published in this local lab preview only. Nothing was sent or saved." },
    }));
  }

  return (
    <>
      <header className="pipeline-lab-header">
        <Link className="brand" to="/dashboard" aria-label="AliMind dashboard">
          <span className="brand-icon"><Sprout size={19} /></span>
          <span>ali<span className="brand-highlight">mind</span></span>
        </Link>
        <Link className="pipeline-back-link" to="/demo"><ArrowLeft size={15} /> Back to chat</Link>
      </header>
      <main className="pipeline-lab-page">
        <div className="pipeline-lab-intro">
          <Badge className="pipeline-lab-kicker"><Beaker size={14} /> DEVELOPER TOOL · LOCAL ONLY</Badge>
          <h1>Human-review pipeline lab</h1>
          <p>AI proposes a Q1 score for a synthetic-only experiment. A human must decide whether it is usable and write all participant-facing content. This local lab does not save or publish participant results.</p>
          <Button className="pipeline-run-all" onClick={runAll} disabled={!canRunPipeline}><Play size={15} /> Run available analysis steps</Button>
        </div>

        <section className="pipeline-step-list" aria-label="Five human-review pipeline steps">
          {STEPS.map((step) => {
            const result = results[step.id];
            return (
              <Card className="pipeline-step-card" key={step.id}>
                <div className="pipeline-step-number">{String(step.id).padStart(2, "0")}</div>
                <div className="pipeline-step-content">
                  <div className="pipeline-step-heading"><div><h2>{step.title}</h2><p>{step.summary}</p></div>
                    {result && <Badge className={`pipeline-status ${resultTone(result.status)}`}>{result.status === "passed" ? <Check size={12} /> : result.status === "loading" ? <LoaderCircle size={12} className="pipeline-spinner" /> : null}{result.status.replace("-", " ")}</Badge>}
                  </div>
                  {step.id === 2 && (
                    <div className="pipeline-tpb-inference-test">
                      <p className="pipeline-tpb-inference-question"><strong>Fixed test item · Q1</strong><br />{TPB_Q1.prompt}</p>
                      <label htmlFor="pipeline-tpb-q1-answer">Test response for Q1 (shared with Part A)</label>
                      <textarea
                        id="pipeline-tpb-q1-answer"
                        rows={3}
                        value={tpbResponses[TPB_Q1.id] ?? ""}
                        onChange={(event) => updateTpbResponse(TPB_Q1.id, event.target.value)}
                        disabled={isRunningQ1Experiment}
                        placeholder="Answer in your own words"
                      />
                      <p className="pipeline-tpb-synthetic-warning">
                        Synthetic-only experiment: 70 generated examples (10 per score) are split into 42 training,
                        14 calibration, and 14 held-out test answers. The test answers are not used to fit the Ridge
                        head or calibration scale. This is not real respondent data.
                      </p>
                      <Button
                        className="button button-dark"
                        onClick={runQ1BertExperiment}
                        disabled={!tpbResponses[TPB_Q1.id]?.trim() || isRunningQ1Experiment}
                      >
                        {isRunningQ1Experiment && <LoaderCircle size={14} className="pipeline-spinner" />}
                        {isRunningQ1Experiment ? "Loading BERT and running experiment…" : "Run BERT Q1 experiment"}
                      </Button>
                      {isRunningQ1Experiment && (
                        <p className="pipeline-ttm-note" role="status">
                          Python is loading {TPB_INFERENCE_MODEL.id} and running the local experiment. On first run,
                          model weights may need to download from Hugging Face.
                        </p>
                      )}
                      {q1Experiment && (
                        <div className="pipeline-tpb-comparison-results" aria-live="polite">
                          <p>
                            <strong>AI score proposal (synthetic demo only): {q1Experiment.predictedScore}/7</strong>
                          </p>
                          <p>Model: {q1Experiment.model} · {q1Experiment.method}</p>
                          <ol aria-label="Synthetic-demo score distribution">
                            {q1Experiment.probabilities.map((group) => (
                              <li key={group.score}>Score {group.score}: {(group.probability * 100).toFixed(1)}%</li>
                            ))}
                          </ol>
                          <p>This distribution is not validated confidence. It is generated from synthetic references and requires human review; it must not be used as a participant score.</p>
                          <p>
                            Held-out synthetic set (n={q1Experiment.syntheticEvaluation.testCount}): MAE{" "}
                            {q1Experiment.syntheticEvaluation.testMae.toFixed(2)}, within-one{" "}
                            {(q1Experiment.syntheticEvaluation.testWithinOne * 100).toFixed(1)}%, Brier{" "}
                            {q1Experiment.syntheticEvaluation.testBrierScore.toFixed(3)}, ECE{" "}
                            {q1Experiment.syntheticEvaluation.testEce.toFixed(3)}.
                          </p>
                          <p>{q1Experiment.syntheticEvaluation.note}</p>
                        </div>
                      )}
                      {q1ExperimentError && (
                        <p className="pipeline-tpb-synthetic-warning is-error" role="alert">{q1ExperimentError}</p>
                      )}
                      <div className="pipeline-tpb-model-info">
                        <p>
                          <strong>Python model:</strong>{" "}
                          <a href={TPB_INFERENCE_MODEL.modelCardUrl} target="_blank" rel="noreferrer">
                            {TPB_INFERENCE_MODEL.id}
                          </a>
                        </p>
                        <p>
                          Python loads this pretrained <strong>{TPB_INFERENCE_MODEL.pretrainedTask}</strong> encoder,
                          freezes its weights, mean-pools Q1 embeddings, and fits a Ridge score head on synthetic
                          answers. Gaussian residual calibration uses a separate synthetic split. The scores and
                          probabilities are only a test of the pipeline, not validated TPB results.
                        </p>
                        <p>
                          <a href={TPB_INFERENCE_MODEL.architectureDocsUrl} target="_blank" rel="noreferrer">
                            BERT model documentation
                          </a>
                          {" · "}
                          <a href={TPB_INFERENCE_MODEL.classificationDocsUrl} target="_blank" rel="noreferrer">
                            Hugging Face sequence-classification guide
                          </a>
                        </p>
                        <p>Setup: <code>python -m pip install -r server/tpb/requirements.txt</code></p>
                      </div>
                    </div>
                  )}
                  {step.id === 1 && (
                    <>
                      <details className="pipeline-part-editor pipeline-part-a">
                        <summary>
                          <span>PART A: TPB Free-Text Questions</span>
                          <span className="pipeline-part-count">{completedFreeTextAnswers}/{TPB_FREE_TEXT_QUESTION_COUNT} answered</span>
                        </summary>
                        <p className="pipeline-ttm-note">Answer in your own words. Rating scales are not shown. Responses stay in this page's memory; no numeric score is generated until a comparison dataset and scoring rubric are available.</p>
                        <div className="pipeline-tpb-sections">
                          {TPB_FREE_TEXT_SECTIONS.map((section) => (
                            <details className="pipeline-tpb-section" key={section.id}>
                              <summary>{section.title}</summary>
                              <div className="pipeline-tpb-question-list">
                                {section.questions.map((question) => (
                                  <label key={question.id}>
                                    <span>{question.number}. {question.prompt}</span>
                                    <span className="pipeline-tpb-response-prompt">{question.responsePrompt}</span>
                                    <textarea
                                      rows={3}
                                      value={tpbResponses[question.id] ?? ""}
                                      onChange={(event) => updateTpbResponse(question.id, event.target.value)}
                                      placeholder="Type your answer in your own words"
                                    />
                                  </label>
                                ))}
                              </div>
                            </details>
                          ))}
                        </div>
                      </details>
                      <details className="pipeline-part-editor pipeline-part-b">
                        <summary>PART B: Your Current Stage of Change · Quick Staging Questions</summary>
                        <div className="pipeline-ttm-screening">
                      <TtmYesNoQuestion
                        id="ttm-current-pattern"
                        legend="1. Do you currently follow a healthy eating pattern as described above?"
                        value={ttmAnswers.currentlyFollowingHealthyPattern}
                        onChange={(value) => updateTtmAnswer("currentlyFollowingHealthyPattern", value)}
                      />
                      {ttmAnswers.currentlyFollowingHealthyPattern === true && (
                        <TtmYesNoQuestion
                          id="ttm-duration"
                          legend="2. (If YES to Q1) Have you been following a healthy eating pattern for more than 1 month?"
                          value={ttmAnswers.followingForMoreThanOneMonth}
                          onChange={(value) => updateTtmAnswer("followingForMoreThanOneMonth", value)}
                        />
                      )}
                      {ttmAnswers.currentlyFollowingHealthyPattern === false && (
                        <TtmYesNoQuestion
                          id="ttm-intention-month"
                          legend="3. (If NO to Q1) Do you intend to start following a healthy eating pattern in the next month?"
                          value={ttmAnswers.intendsToStartWithinOneMonth}
                          onChange={(value) => updateTtmAnswer("intendsToStartWithinOneMonth", value)}
                        />
                      )}
                      {ttmAnswers.currentlyFollowingHealthyPattern === false && ttmAnswers.intendsToStartWithinOneMonth === true && (
                        <TtmYesNoQuestion
                          id="ttm-intention-week"
                          legend="4. (If YES to Q3) Do you intend to start following a healthy eating pattern in the next week?"
                          value={ttmAnswers.intendsToStartWithinOneWeek}
                          onChange={(value) => updateTtmAnswer("intendsToStartWithinOneWeek", value)}
                        />
                      )}
                      <div className={`pipeline-ttm-live-stage${liveTtmClassification.status === "incomplete" ? " is-incomplete" : ""}`} aria-live="polite">
                        <strong>Current TTM stage:</strong>{" "}
                        {liveTtmClassification.stage
                          ? `${liveTtmClassification.stage}${liveTtmClassification.status === "incomplete" ? " (provisional)" : ""}`
                          : "Answer Q1 to begin classification."}
                        {liveTtmClassification.status === "incomplete" && (
                          <span className="pipeline-ttm-next-question"> {liveTtmClassification.reason}</span>
                        )}
                      </div>
                      <p className="pipeline-ttm-note">Questions appear only when their parent answer leads to them. The stage updates as you move through the decision tree. The supplied one-month and one-week cutoffs are prototype estimates, not conventional TTM time windows.</p>
                        </div>
                      </details>
                      <details className="pipeline-context-editor">
                        <summary>Optional sample message</summary>
                        <label htmlFor="pipeline-context-input">Sample context for a future extractor</label>
                        <textarea id="pipeline-context-input" rows={3} value={contextMessage} onChange={(event) => { setContextMessage(event.target.value); invalidateHumanWork(); }} placeholder="Example: I want to eat more vegetables, but I have little time and a tight budget." />
                        <p>This text is only held in page memory. Context extraction is not implemented, and the lab does not save it.</p>
                      </details>
                    </>
                  )}
                  {step.id === 4 && (
                    <div className="pipeline-human-review">
                      <p className="pipeline-review-notice">
                        This is a workflow simulation using the synthetic Q1 experiment. A reviewer must make an explicit
                        decision; no model threshold or score automatically approves the result.
                      </p>
                      <p className="pipeline-review-current">
                        <strong>Participant answer to review:</strong>{" "}
                        {tpbResponses[TPB_Q1.id]?.trim() || "No answer provided."}
                        {q1Experiment && <> · <strong>AI proposal:</strong> {q1Experiment.predictedScore}/7 (synthetic demo only)</>}
                      </p>
                      <p className="pipeline-review-current" role="status">{formatHumanReviewDecision(q1Review)}</p>
                      <div className="pipeline-review-actions">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!q1Experiment || results[1]?.status !== "passed"}
                          onClick={() => recordHumanDecision(confirmQ1Proposal(q1Experiment?.predictedScore))}
                        >
                          Confirm proposed score
                        </Button>
                      </div>
                      <label className="pipeline-review-field" htmlFor="pipeline-review-override-score">
                        Correct the score
                        <select
                          id="pipeline-review-override-score"
                          value={overrideScore}
                          onChange={(event) => updateOverrideScore(event.target.value)}
                          disabled={!q1Experiment || results[1]?.status !== "passed"}
                        >
                          {[1, 2, 3, 4, 5, 6, 7].map((score) => (
                            <option key={score} value={score}>{score}</option>
                          ))}
                        </select>
                      </label>
                      <label className="pipeline-review-field" htmlFor="pipeline-review-reason">
                        Reviewer reason (required for correction or unscorable)
                        <textarea
                          id="pipeline-review-reason"
                          rows={2}
                          value={reviewReason}
                          onChange={(event) => updateReviewReason(event.target.value)}
                          disabled={results[1]?.status !== "passed"}
                          placeholder="Explain the human decision"
                        />
                      </label>
                      <div className="pipeline-review-actions">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!q1Experiment || results[1]?.status !== "passed"}
                          onClick={() => recordHumanDecision(overrideQ1Score(Number(overrideScore), reviewReason))}
                        >
                          Save corrected score
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={results[1]?.status !== "passed"}
                          onClick={() => recordHumanDecision(markQ1Unscorable(reviewReason))}
                        >
                          Mark unscorable
                        </Button>
                      </div>
                      {reviewError && <p className="pipeline-tpb-synthetic-warning is-error" role="alert">{reviewError}</p>}
                      {results[1]?.status !== "passed" && (
                        <p className="pipeline-ttm-note">Run Step 1 before making a review decision. Confirm/correct also requires an available Q1 proposal; unscorable is available when the model cannot score it.</p>
                      )}
                    </div>
                  )}
                  {step.id === 5 && (
                    <div className="pipeline-human-review">
                      <p className="pipeline-review-notice">
                        Write the participant-facing text yourself. The TTM stage and score are context only; this lab
                        does not generate a reply or select a recommendation.
                      </p>
                      <label className="pipeline-review-field" htmlFor="pipeline-human-response">
                        Human-authored response
                        <textarea
                          id="pipeline-human-response"
                          rows={4}
                          value={humanResponse}
                          onChange={(event) => updateHumanDraft(setHumanResponse, event.target.value)}
                          placeholder="Write the response that a participant would see"
                        />
                      </label>
                      <label className="pipeline-review-field" htmlFor="pipeline-human-recommendation">
                        Human-authored recommendation
                        <textarea
                          id="pipeline-human-recommendation"
                          rows={3}
                          value={humanRecommendation}
                          onChange={(event) => updateHumanDraft(setHumanRecommendation, event.target.value)}
                          placeholder="Write a recommendation, or explain that none is appropriate"
                        />
                      </label>
                      <p className="pipeline-ttm-note">Preview and publishing are simulated in this browser only. Nothing is sent to a participant, saved to Supabase, or generated from model output.</p>
                      <Button
                        variant="outline"
                        disabled={!reviewCanPublish}
                        onClick={previewHumanResult}
                      >
                        Preview human-authored result
                      </Button>
                      {!reviewCanPublish && (
                        <p className="pipeline-ttm-note">Complete an explicit human score decision and provide both authored fields to enable publishing.</p>
                      )}
                      {(isPreviewing || isPublished) && (
                        <div className="pipeline-human-published" aria-live="polite">
                          <strong>{isPublished ? "Published preview · local simulation" : "Review preview · not published"}</strong>
                          <p>{humanResponse}</p>
                          <p><strong>Recommendation:</strong> {humanRecommendation}</p>
                          <p>{formatHumanReviewDecision(q1Review)}</p>
                        </div>
                      )}
                      {isPreviewing && (
                        <Button
                          className="button button-dark"
                          disabled={!reviewCanPublish}
                          onClick={publishHumanResult}
                        >
                          Publish human-authored preview
                        </Button>
                      )}
                    </div>
                  )}
                  {result && <pre className={`pipeline-step-output ${resultTone(result.status)}`}>{result.output}</pre>}
                </div>
                {step.id <= 3 && <Button className="pipeline-run-step" variant="outline" size="sm" onClick={() => runOne(step.id)}><Play size={13} /> Run</Button>}
              </Card>
            );
          })}
        </section>
        <Card className="pipeline-recipe-tool">
          <h2>Optional recipe tool · separate from review</h2>
          <p>Recipe search remains a standalone lab utility. It is not part of scoring, reviewer decisions, or the authored recommendation.</p>
          <RecipeFinder />
        </Card>
        <p className="pipeline-lab-footnote">All assessment and reviewer-demo data stays in this browser page and is not written to Supabase. Use <code>npm test</code> for repeatable automated checks.</p>
      </main>
    </>
  );
}
