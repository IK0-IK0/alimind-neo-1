import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Check,
  CircleDot,
  ClipboardCheck,
  Eye,
  FileText,
  Lightbulb,
  MessageSquareText,
  Save,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/primitives";
import { apiRequest } from "../../lib/api";
import { isAccountRole } from "../accounts/roles";
import {
  PILOT_ADDITIONAL_QUESTIONS,
  PILOT_TPB_QUESTIONS,
  PILOT_TTM_QUESTIONS,
} from "../../data/pilot-survey-questions";
import type { TpbConstructScore } from "../assessment/tpb-calculation";
import { SAMPLE_CASES, type SampleCase } from "./reviewer-sample-data";
import { REVIEWER_CONSTRUCT_GROUPS } from "./reviewer-assessment";
import LiveReviewerAssessmentsPage from "./LiveReviewerAssessmentsPage";
import {
  clearKnownPrefillText,
  createEmptyReviewDraft,
  loadReviewDrafts,
  saveReviewDrafts,
  type ReviewDraft,
  type ReviewDrafts,
} from "./reviewer-drafts";
import { getReviewerGuidance } from "./reviewer-guidance";
import ReviewerRecipePicker from "./ReviewerRecipePicker";
import { appendRecipeToResponse } from "./reviewer-recipes";

type AccessState = "checking" | "allowed" | "denied" | "error";
type SampleReviewStatus = "Needs review" | "In progress" | "Complete";

interface SampleWorkflowState {
  status: SampleReviewStatus;
  assignedTo: string;
}

const INITIAL_WORKFLOW_STATE: SampleWorkflowState = {
  status: "Needs review",
  assignedTo: "Unassigned",
};

function getDefaultReviewDrafts(): ReviewDrafts {
  return Object.fromEntries(
    SAMPLE_CASES.map((sampleCase) => [sampleCase.id, createEmptyReviewDraft()]),
  );
}

function loadBrowserReviewDrafts(): { drafts: ReviewDrafts; error: string } {
  const defaults = getDefaultReviewDrafts();
  try {
    if (typeof window === "undefined") return { drafts: defaults, error: "" };
    const loaded = loadReviewDrafts(window.localStorage, defaults);
    const previousPrefills = Object.fromEntries(
      SAMPLE_CASES.map((sampleCase) => {
        const guidance = getReviewerGuidance(sampleCase);
        return [sampleCase.id, {
          response: guidance.response,
          recommendation: guidance.recommendation,
        }];
      }),
    );
    return {
      ...loaded,
      drafts: clearKnownPrefillText(loaded.drafts, previousPrefills),
    };
  } catch (error) {
    return {
      drafts: defaults,
      error: `Could not access saved review drafts: ${error instanceof Error ? error.message : "Unknown storage error."}`,
    };
  }
}

function saveBrowserReviewDrafts(drafts: ReviewDrafts): string {
  try {
    if (typeof window === "undefined") return "Review drafts can only be saved in a browser.";
    return saveReviewDrafts(window.localStorage, drafts);
  } catch (error) {
    return `Could not access browser storage: ${error instanceof Error ? error.message : "Unknown storage error."}`;
  }
}

function getSampleIntentionLabel(sampleCase: SampleCase): string {
  const answers = sampleCase.pilotTtmResponses;
  if (answers[63] === true) return "Already following";
  if (answers[65] === true) return answers[66] === true ? "Within 1 week" : "Within 1 month";
  if (answers[65] === false) return "No plan this month";
  return "Not reported";
}

function formatAdditionalAnswer(value: string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

function ScoreMetric({
  label,
  beliefBased,
  direct,
  directUnavailable,
}: {
  label: string;
  beliefBased?: TpbConstructScore | null;
  direct?: TpbConstructScore | null;
  directUnavailable?: string;
}) {
  return (
    <div className="reviewer-tpb-metric">
      <strong>{label}</strong>
      {beliefBased && (
        <div>
          <span>Belief-based composite</span>
          <b>{beliefBased.sum} / {beliefBased.itemCount * beliefBased.itemMax}</b>
          <small>{beliefBased.itemCount} belief × evaluation pairs · mean product {beliefBased.mean.toFixed(1)} / 49</small>
        </div>
      )}
      {direct && (
        <div>
          <span>Direct measure</span>
          <b>{direct.mean.toFixed(1)} / 7</b>
          <small>Mean of {direct.itemCount} items</small>
        </div>
      )}
      {!direct && directUnavailable && (
        <div>
          <span>Direct measure</span>
          <small>{directUnavailable}</small>
        </div>
      )}
    </div>
  );
}

export default function ReviewerWorkspacePage({ sampleMode = false }: { sampleMode?: boolean }) {
  return sampleMode ? <SampleReviewerWorkspacePage /> : <LiveReviewerAssessmentsPage />;
}

function SampleReviewerWorkspacePage() {
  const sampleMode = true;
  const { user } = useAuth();
  const [access, setAccess] = useState<AccessState>("checking");
  const [accessError, setAccessError] = useState("");
  const [selectedCase, setSelectedCase] = useState(SAMPLE_CASES[0]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [workflowByCase, setWorkflowByCase] = useState<Record<string, SampleWorkflowState>>(
    () => Object.fromEntries(SAMPLE_CASES.map((sampleCase) => [sampleCase.id, INITIAL_WORKFLOW_STATE])),
  );
  const [workflowNotice, setWorkflowNotice] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const [initialReviewDrafts] = useState(loadBrowserReviewDrafts);
  const [reviewDraftsByCase, setReviewDraftsByCase] = useState(initialReviewDrafts.drafts);
  const [reviewDraftStorageError, setReviewDraftStorageError] = useState(initialReviewDrafts.error);
  const [previewed, setPreviewed] = useState(false);
  const [published, setPublished] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const currentReviewerName = user
    ? (typeof user.user_metadata.name === "string" && user.user_metadata.name.trim()) || user.email || "Current reviewer"
    : sampleMode ? "Sample reviewer" : "Current reviewer";
  const workflow = workflowByCase[selectedCase.id] ?? INITIAL_WORKFLOW_STATE;
  const reviewDraft = reviewDraftsByCase[selectedCase.id] ?? createEmptyReviewDraft();
  const reviewerGuidance = getReviewerGuidance(selectedCase);

  useEffect(() => {
    if (sampleMode) {
      setAccess("allowed");
      return;
    }
    let active = true;
    void (async () => {
      try {
        const { role } = await apiRequest<{ role: unknown }>("/api/account/role");
        if (!active) return;
        if (!isAccountRole(role)) throw new Error("The server returned an unknown account role.");
        if (role !== "reviewer") {
          setAccess("denied");
          return;
        }
        await apiRequest<{ allowed: true }>("/api/reviewer/access");
        if (active) setAccess("allowed");
      } catch (requestError) {
        if (!active) return;
        if (requestError instanceof Error && requestError.message.includes("does not have reviewer access")) {
          setAccess("denied");
          return;
        }
        setAccessError(requestError instanceof Error ? requestError.message : "Could not verify reviewer access.");
        setAccess("error");
      }
    })();
    return () => { active = false; };
  }, [sampleMode]);

  function chooseCase(sampleCase: SampleCase) {
    setReviewDraftStorageError(saveBrowserReviewDrafts(reviewDraftsByCase));
    setSelectedCase(sampleCase);
    setPreviewed(false);
    setPublished(false);
    setReviewError("");
    setWorkflowNotice("");
    setWorkflowError("");
  }

  function startReview(sampleCase: SampleCase) {
    chooseCase(sampleCase);
    setWorkflowByCase((current) => ({
      ...current,
      [sampleCase.id]: {
        status: "In progress",
        assignedTo: currentReviewerName,
      },
    }));
    setReviewOpen(true);
  }

  function updateWorkflow(update: Partial<SampleWorkflowState>) {
    setWorkflowByCase((current) => ({
      ...current,
      [selectedCase.id]: { ...(current[selectedCase.id] ?? INITIAL_WORKFLOW_STATE), ...update },
    }));
  }

  function updateReviewDraft(update: Partial<Omit<ReviewDraft, "updatedAt">>) {
    const updatedDrafts = {
      ...reviewDraftsByCase,
      [selectedCase.id]: {
        ...reviewDraft,
        ...update,
        updatedAt: new Date().toISOString(),
      },
    };
    setReviewDraftsByCase(updatedDrafts);
    setReviewDraftStorageError(saveBrowserReviewDrafts(updatedDrafts));
    setPreviewed(false);
    setPublished(false);
    setReviewError("");
  }

  function saveCurrentReviewDraft() {
    setReviewDraftStorageError(saveBrowserReviewDrafts(reviewDraftsByCase));
  }

  function moveCase(direction: -1 | 1) {
    const currentIndex = SAMPLE_CASES.findIndex((sampleCase) => sampleCase.id === selectedCase.id);
    const nextIndex = (currentIndex + direction + SAMPLE_CASES.length) % SAMPLE_CASES.length;
    chooseCase(SAMPLE_CASES[nextIndex]);
  }

  function previewResult() {
    if (!reviewDraft.response.trim() || !reviewDraft.recommendation.trim()) {
      setReviewError("Add a participant response and recommendation before previewing.");
      return;
    }
    setReviewError("");
    setPreviewed(true);
    setPublished(false);
  }

  function saveDraft() {
    saveCurrentReviewDraft();
    setWorkflowNotice("Draft saved in this browser.");
    setWorkflowError("");
  }

  function completeReview() {
    if (!previewed) {
      setWorkflowError("Preview the completed human response and recommendation before marking this sample reviewed.");
      setWorkflowNotice("");
      return;
    }
    saveCurrentReviewDraft();
    updateWorkflow({ status: "Complete" });
    setWorkflowNotice("Sample marked reviewed on this page only; nothing was saved or sent.");
    setWorkflowError("");
  }

  if (access === "checking") {
    return <main className="reviewer-access-state" role="status">Verifying reviewer access…</main>;
  }

  if (access === "denied") {
    return (
      <main className="reviewer-access-state">
        <ShieldCheck size={28} />
        <h1>Reviewer access required</h1>
        <p>This account does not have the reviewer role. A project administrator must assign reviewer access.</p>
        <Link className="button button-dark" to="/account">View account role</Link>
      </main>
    );
  }

  if (access === "error") {
    return (
      <main className="reviewer-access-state">
        <h1>Could not verify reviewer access</h1>
        <p role="alert">{accessError}</p>
        <Link className="button button-dark" to="/account">View account access</Link>
      </main>
    );
  }

  return (
    <main className="reviewer-workspace">
      <div className="reviewer-topline">
        <Link className="reviewer-back-link" to="/dashboard"><ArrowLeft size={15} /> Dashboard</Link>
        <Badge className="reviewer-sample-badge">SAMPLE UI · NO REAL CASES</Badge>
      </div>
      <section className="reviewer-heading">
        <div>
          <span className="eyebrow">HUMAN REVIEW WORKSPACE</span>
          <h1>Reviewer workspace</h1>
          <p>Welcome in. Review the sample answers, check the score summary, and write a thoughtful response.</p>
        </div>
        <Badge className="account-role-badge role-reviewer"><ShieldCheck size={13} /> Reviewer access</Badge>
      </section>
      <div className="reviewer-sample-notice" role="note">
        This is a visual sample with fabricated answers. No participant records are connected, and review actions stay in this page only.
      </div>

      <section className="reviewer-queue-shell" aria-label="Submitted assessment queue">
        <div className="reviewer-queue-title">
          <div><span className="eyebrow">REVIEW QUEUE</span><h2>Submitted assessments</h2></div>
          <Badge>{SAMPLE_CASES.length} sample cases</Badge>
        </div>
        <div className="reviewer-case-list">
          {SAMPLE_CASES.map((sampleCase) => {
            const caseWorkflow = workflowByCase[sampleCase.id] ?? INITIAL_WORKFLOW_STATE;
            return (
              <article className="reviewer-case-row" key={sampleCase.id}>
                <div className="reviewer-case-avatar">{sampleCase.set}</div>
                <div className="reviewer-case-row-main">
                  <div className="reviewer-case-row-title">
                    <strong>{sampleCase.id}</strong>
                    <Badge className={`reviewer-status-badge status-${caseWorkflow.status.toLowerCase().replace(" ", "-")}`}>
                      {caseWorkflow.status}
                    </Badge>
                    <Badge className="reviewer-assignee-badge"><UsersRound size={11} /> {caseWorkflow.assignedTo === "Unassigned" ? "Unassigned" : `Assigned to ${caseWorkflow.assignedTo}`}</Badge>
                  </div>
                  <p>{sampleCase.participant} <span>·</span> {sampleCase.progress}</p>
                  <small>{sampleCase.submitted} <span>·</span> Set {sampleCase.set}</small>
                  <div className="reviewer-case-summary" aria-label="Intention and TTM screening summary">
                    <span className="reviewer-case-result">
                      <Lightbulb size={13} />
                      <span>Intention</span>
                      <strong>{getSampleIntentionLabel(sampleCase)}</strong>
                    </span>
                    <span className="reviewer-case-result">
                      <CircleDot size={13} />
                      <span>TTM stage</span>
                      <strong>{sampleCase.ttmResult.stage}</strong>
                    </span>
                  </div>
                </div>
                <div className="reviewer-case-row-actions">
                  <Button
                    className="button button-dark"
                    onClick={() => startReview(sampleCase)}
                  >
                    <ClipboardCheck size={14} /> Review
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      chooseCase(sampleCase);
                      setDetailsOpen(true);
                    }}
                  >
                    <FileText size={14} /> More details
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
        <p className="reviewer-queue-footnote">Sample-only queue. Names, scores, answers, and review states are fabricated.</p>
      </section>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        {detailsOpen && (
          <DialogContent className="reviewer-details-dialog">
            <span className="eyebrow">SET {selectedCase.set} · SUBMITTED ASSESSMENT</span>
            <DialogTitle>{selectedCase.id}</DialogTitle>
            <DialogDescription>
              {selectedCase.participant} · {selectedCase.progress} · {selectedCase.submitted}
            </DialogDescription>
            <div className="reviewer-dialog-scroll">
              <section className="reviewer-tpb-summary" aria-label={`Set ${selectedCase.set} TPB formula scores`}>
                <div className="reviewer-tpb-summary-heading">
                  <span className="reviewer-tpb-icon"><BarChart3 size={16} /></span>
                  <div><span className="eyebrow">LEGACY SCORE EXAMPLE · SAMPLE</span><h3>Set {selectedCase.set} construct scores</h3></div>
                </div>
                <p className="reviewer-tpb-caveat">These fabricated numeric examples come from a legacy instrument and are not calculated from the pilot-survey responses shown here. Belief-based composites multiply two 1–7 ratings (up to 49 per pair), while direct scores average 1–7 items; they are not comparable or combined.</p>
                <div className="reviewer-tpb-grid">
                  <ScoreMetric label="Attitude" beliefBased={selectedCase.tpbScores.attitude.beliefBased} directUnavailable="No compatible direct measure." />
                  <ScoreMetric label="Subjective norm" beliefBased={selectedCase.tpbScores.subjectiveNorm.beliefBased} direct={selectedCase.tpbScores.subjectiveNorm.direct} />
                  <ScoreMetric label="Perceived control" beliefBased={selectedCase.tpbScores.perceivedControl.beliefBased} direct={selectedCase.tpbScores.perceivedControl.direct} />
                </div>
                <small className="reviewer-tpb-note">Constructs are reported separately. TPB does not prescribe one combined grand score.</small>
              </section>
              <section className="reviewer-responses" aria-label="Sample TPB construct questions and responses">
                <h3>TPB constructs and answers</h3>
                <p>Fabricated responses to the pilot survey, grouped by the requested construct sections.</p>
                <div className="reviewer-response-sections">
                  {REVIEWER_CONSTRUCT_GROUPS.map((group) => {
                    const questions = PILOT_TPB_QUESTIONS.filter((question) => question.construct === group.construct);
                    const sections = [...new Set(questions.map((question) => question.section))];
                    return (
                      <details key={group.construct}>
                        <summary>{group.label}<small>{group.sectionsLabel} · {questions.length} questions</small></summary>
                        <div className="reviewer-response-construct-sections">
                          {sections.map((section) => {
                            const sectionQuestions = questions.filter((question) => question.section === section);
                            return (
                              <details key={section}>
                                <summary>{section}<small>{sectionQuestions.length} questions</small></summary>
                                <ol>
                                  {sectionQuestions.map((question) => {
                                    const response = selectedCase.pilotTpbResponses[question.id];
                                    return (
                                      <li key={question.id}>
                                        <strong>Q{question.number} · {question.prompt}</strong>
                                        <p>{response}</p>
                                      </li>
                                    );
                                  })}
                                </ol>
                              </details>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </section>
              <section className="reviewer-ttm-details" aria-label="Sample TTM stage and responses">
                <section className="reviewer-ttm-result" aria-label="Sample TTM stage result">
                  <div><span className="eyebrow">TTM STAGE · SAMPLE</span><strong>{selectedCase.ttmResult.stage}</strong></div>
                  <p>{selectedCase.ttmResult.reason}</p>
                  <small>Prototype screening result; not a validated clinical classification.</small>
                </section>
                <section className="reviewer-responses" aria-label="Sample TTM screening questions and responses">
                  <h3>TTM screening answers</h3>
                  <p>Conditional items are marked when the survey branch does not ask them.</p>
                  <div className="reviewer-response-sections">
                    <details>
                      <summary>View screening answers<small>{PILOT_TTM_QUESTIONS.length} questions</small></summary>
                      <ol className="reviewer-survey-answer-list">
                        {PILOT_TTM_QUESTIONS.map((question) => {
                          const answer = selectedCase.pilotTtmResponses[question.number];
                          const isApplicable = !question.dependsOn
                            || selectedCase.pilotTtmResponses[question.dependsOn.questionNumber] === question.dependsOn.answer;
                          const response = !isApplicable
                            ? "Not asked (conditional)"
                            : answer === null || answer === undefined
                              ? "No response recorded."
                              : answer ? "Yes" : "No";
                          return (
                            <li key={question.id}>
                              <strong>Q{question.number} · {question.prompt}</strong>
                              <p>{response}</p>
                            </li>
                          );
                        })}
                      </ol>
                    </details>
                  </div>
                </section>
              </section>
              <section className="reviewer-responses" aria-label="Sample additional survey questions and responses">
                <h3>Additional survey questions</h3>
                <p>Fabricated answers to the pilot survey’s additional questions. Follow-ups appear when a sample response includes one.</p>
                <div className="reviewer-response-sections">
                  <details>
                    <summary>View additional answers<small>{PILOT_ADDITIONAL_QUESTIONS.length} questions</small></summary>
                    <ol className="reviewer-survey-answer-list">
                      {PILOT_ADDITIONAL_QUESTIONS.map((question) => {
                        const response = selectedCase.additionalResponses[question.id];
                        return (
                          <li key={question.id}>
                            <strong>Q{question.number} · {question.prompt}</strong>
                            <p>{response ? formatAdditionalAnswer(response.value) : "No response recorded."}</p>
                            {question.followUp && response?.followUp && (
                              <small className="reviewer-survey-follow-up">
                                <strong>{question.followUp}</strong> {response.followUp}
                              </small>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </details>
                </div>
              </section>
            </div>
            <div className="reviewer-dialog-actions">
              <Button variant="outline" onClick={() => moveCase(-1)}>Previous</Button>
              <Button variant="outline" onClick={() => moveCase(1)}>Next</Button>
              <Button className="button button-dark" onClick={() => { setDetailsOpen(false); startReview(selectedCase); }}>
                Review this case
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={reviewOpen}
        onOpenChange={(open) => {
          if (!open) saveCurrentReviewDraft();
          setReviewOpen(open);
        }}
      >
        {reviewOpen && (
          <DialogContent className="reviewer-review-dialog">
            <div className="reviewer-review-heading">
              <div>
                <span className="eyebrow">HUMAN REVIEW · SAMPLE</span>
                <DialogTitle>Review {selectedCase.id}</DialogTitle>
              </div>
              <div className="reviewer-workflow-badges" aria-label="Review status and assigned reviewer">
                <Badge className={`reviewer-status-badge status-${workflow.status.toLowerCase().replace(" ", "-")}`}>
                  {workflow.status}
                </Badge>
                <Badge className="reviewer-assignee-badge"><UsersRound size={11} /> {workflow.assignedTo === "Unassigned" ? "Unassigned" : `Assigned to ${workflow.assignedTo}`}</Badge>
              </div>
            </div>
            <DialogDescription>Review the full assessment summary, then write a supportive response and practical recommendation.</DialogDescription>
            <div className={`reviewer-draft-save-state${reviewDraftStorageError ? " has-error" : ""}`}>
              {reviewDraftStorageError ? (
                <span role="alert">{reviewDraftStorageError}</span>
              ) : (
                <>
                  <Check size={14} />
                  <span>{reviewDraft.updatedAt ? "Draft saved in this browser" : "Draft saves automatically as you edit"}</span>
                  <small>Only for this case and browser; not sent to the participant.</small>
                </>
              )}
            </div>
            <div className="reviewer-dialog-scroll reviewer-review-form">
              <section className="reviewer-review-summary" aria-label={`Set ${selectedCase.set} assessment at a glance`}>
                <div className="reviewer-review-summary-heading">
                  <div>
                    <span className="eyebrow"><BarChart3 size={13} /> ASSESSMENT AT A GLANCE</span>
                    <strong>Set {selectedCase.set} · {selectedCase.progress}</strong>
                  </div>
                </div>
                <div className="reviewer-summary-primary-pair">
                  <div className="reviewer-summary-stage">
                    <span><CircleDot size={13} /> TTM readiness stage</span>
                    <strong>{selectedCase.ttmResult.stage}</strong>
                    <p>{selectedCase.ttmResult.reason}</p>
                  </div>
                  <div className="reviewer-summary-intention">
                    <span><Sparkles size={13} /> PRIMARY OUTCOME</span>
                    <strong>{getSampleIntentionLabel(selectedCase)}</strong>
                    <small>Intention · from conditional TTM answers</small>
                  </div>
                </div>
                <details className="reviewer-summary-score-details">
                  <summary><BarChart3 size={13} /> View full TPB calculations and item details</summary>
                  <div>
                    <p className="reviewer-review-summary-note">Legacy fabricated score example only; it is not calculated from the pilot-survey responses. Belief-based products and direct 1–7 measures use different scales; do not compare or combine them.</p>
                    <div className="reviewer-tpb-grid">
                      <ScoreMetric label="Attitude" beliefBased={selectedCase.tpbScores.attitude.beliefBased} directUnavailable="No compatible direct measure." />
                      <ScoreMetric label="Subjective norm" beliefBased={selectedCase.tpbScores.subjectiveNorm.beliefBased} direct={selectedCase.tpbScores.subjectiveNorm.direct} />
                      <ScoreMetric label="Perceived control" beliefBased={selectedCase.tpbScores.perceivedControl.beliefBased} direct={selectedCase.tpbScores.perceivedControl.direct} />
                    </div>
                  </div>
                </details>
                <Button
                  variant="outline"
                  className="reviewer-more-details-action"
                  onClick={() => {
                    saveCurrentReviewDraft();
                    setReviewOpen(false);
                    setDetailsOpen(true);
                  }}
                >
                  <FileText size={14} /> More details: questions and responses
                </Button>
              </section>
              <div className="reviewer-guidance-note" role="note">
                <span className="reviewer-guidance-icon"><Sparkles size={16} /></span>
                <div className="reviewer-guidance-content">
                  <div className="reviewer-guidance-badges">
                    <Badge className="reviewer-cue-badge"><Sparkles size={11} /> Reviewer cue</Badge>
                    <Badge className="reviewer-cue-context-badge"><CircleDot size={11} /> TTM {selectedCase.ttmResult.stage}</Badge>
                    <Badge className="reviewer-cue-context-badge"><BarChart3 size={11} /> {reviewerGuidance.lowestTpbSignal}</Badge>
                  </div>
                  <span>Use this sample cue when writing your own response and recommendation. It is not a validated score or ready-to-send advice.</span>
                </div>
              </div>
              <label className="reviewer-author-field" htmlFor="reviewer-response">
                <span className="reviewer-field-heading">
                  <span><MessageSquareText size={14} /> Participant response</span>
                  <small>Participant-facing</small>
                </span>
                <textarea
                  id="reviewer-response"
                  rows={4}
                  value={reviewDraft.response}
                  onChange={(event) => updateReviewDraft({ response: event.target.value })}
                  placeholder="Write a supportive reply that reflects what the participant shared."
                />
              </label>
              <label className="reviewer-author-field" htmlFor="reviewer-recommendation">
                <span className="reviewer-field-heading">
                  <span><Lightbulb size={14} /> Recommendation</span>
                  <small>One practical next step</small>
                </span>
                <textarea
                  id="reviewer-recommendation"
                  rows={3}
                  maxLength={5000}
                  value={reviewDraft.recommendation}
                  onChange={(event) => updateReviewDraft({ recommendation: event.target.value })}
                  placeholder="Write one practical next step."
                />
              </label>
              <ReviewerRecipePicker
                sampleMode
                onSelect={(recipe) => {
                  try {
                    updateReviewDraft({ response: appendRecipeToResponse(reviewDraft.response, recipe) });
                    return true;
                  } catch (error) {
                    setReviewError(error instanceof Error ? error.message : "Could not add this recipe to the participant response.");
                    return false;
                  }
                }}
              />
              {reviewError && <p className="form-error" role="alert">{reviewError}</p>}
              {workflowError && <p className="form-error" role="alert">{workflowError}</p>}
              {previewed && (
                <section className="reviewer-preview" aria-label="Participant result preview">
                  <span className="eyebrow"><MessageSquareText size={13} /> PARTICIPANT PREVIEW · SAMPLE</span>
                  <p>{reviewDraft.response}</p>
                  <p><strong>Recommendation:</strong> {reviewDraft.recommendation}</p>
                  <small><Check size={13} /> Full assessment summary reviewed: Set {selectedCase.set} · TTM {selectedCase.ttmResult.stage}</small>
                </section>
              )}
              {workflowNotice && <p className="reviewer-workflow-notice" role="status">{workflowNotice}</p>}
            </div>
            <div className="reviewer-review-footer">
              <p className="reviewer-review-footer-note">
                {previewed ? "Preview is ready. You can now mark this review complete." : "Preview the response before marking this review complete."}
              </p>
              <div className="reviewer-review-actions">
                <div className="reviewer-review-action-group">
                  <Button variant="outline" onClick={saveDraft}><Save size={15} /> Save draft</Button>
                  <Button variant="outline" onClick={previewResult}><Eye size={15} /> Preview response</Button>
                </div>
                <div className="reviewer-review-action-group reviewer-review-primary-actions">
                  {previewed && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPublished(true);
                        setWorkflowNotice("Sample published in this page only; no participant was notified.");
                      }}
                      disabled={published}
                    >
                      <MessageSquareText size={15} /> {published ? "Sample published" : "Publish sample"}
                    </Button>
                  )}
                  <Button className="button button-dark" onClick={completeReview} disabled={!previewed}>
                    <Check size={15} /> Mark reviewed
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
      <p className="reviewer-footnote">Demo controls only. The live queue, reviewer assignments, audit trail, score persistence, and participant delivery are not connected.</p>
    </main>
  );
}
