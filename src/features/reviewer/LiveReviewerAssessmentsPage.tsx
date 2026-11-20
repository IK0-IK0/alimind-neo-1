import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CircleDot,
  ClipboardCheck,
  Eye,
  FileText,
  LoaderCircle,
  MessageSquareText,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";
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
import {
  groupReviewerQuestionAnswers,
  type ReviewerProfileSummary,
  type ReviewerQuestionAnswer,
} from "./reviewer-assessment";
import ReviewerRecipePicker from "./ReviewerRecipePicker";
import { formatRecipeRecommendation } from "./reviewer-recipes";

type ReviewStatus = "needs_review" | "in_progress" | "completed";
type Assignment = "you" | "another_reviewer" | null;

interface QueueAssessment {
  id: string;
  submittedAt: string;
  answered: number;
  total: number;
  reviewStatus: ReviewStatus;
  assignment: Assignment;
  profile: ReviewerProfileSummary | null;
}

interface QueueResponse {
  assessments: QueueAssessment[];
  page: number;
  pageSize: number;
  total: number;
}

interface ReviewerMessage {
  id: string;
  sender: "bot" | "user";
  text: string;
}

interface ReviewRecord {
  status: Exclude<ReviewStatus, "needs_review">;
  assignment: Assignment;
  responseDraft?: string;
  recommendationDraft?: string;
  selectedRecipe?: string;
  updatedAt: string;
  completedAt: string | null;
  deliveredAt: string | null;
}

interface ReviewerAssessmentDetail {
  assessment: {
    id: string;
    submittedAt: string;
    answered: number;
    total: number;
    messages: ReviewerMessage[];
    questionAnswers: ReviewerQuestionAnswer[];
    profile: ReviewerProfileSummary | null;
  };
  review: ReviewRecord | null;
}

type AccessState = "checking" | "allowed" | "denied" | "error";
type DraftSaveState = "saved" | "pending" | "saving" | "error";

const constructLabels: Record<NonNullable<ReviewerProfileSummary["weakest"]>, string> = {
  attitude: "Attitude",
  subjectiveNorm: "Subjective norm",
  perceivedControl: "Perceived control",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function reviewStatusLabel(status: ReviewStatus) {
  if (status === "completed") return "Reviewed";
  if (status === "in_progress") return "In progress";
  return "Needs review";
}

function assignmentLabel(assignment: Assignment) {
  if (assignment === "you") return "Assigned to you";
  if (assignment === "another_reviewer") return "Assigned to another reviewer";
  return "Unassigned";
}

function statusClass(status: ReviewStatus) {
  if (status === "completed") return "status-complete";
  if (status === "in_progress") return "status-in-progress";
  return "status-needs-review";
}

function profileStage(profile: ReviewerProfileSummary | null) {
  return profile?.stage ?? "Not enough matched answers";
}

function profileWeakest(profile: ReviewerProfileSummary | null) {
  return profile?.weakest ? constructLabels[profile.weakest] : "Not enough matched answers";
}

export default function LiveReviewerAssessmentsPage() {
  const [access, setAccess] = useState<AccessState>("checking");
  const [accessError, setAccessError] = useState("");
  const [queue, setQueue] = useState<QueueAssessment[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState("");
  const [queueReloadKey, setQueueReloadKey] = useState(0);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState("");
  const [selected, setSelected] = useState<ReviewerAssessmentDetail | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [responseDraft, setResponseDraft] = useState("");
  const [recommendationDraft, setRecommendationDraft] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState("");
  const [draftDirty, setDraftDirty] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<DraftSaveState>("saved");
  const [draftError, setDraftError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [previewed, setPreviewed] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const latestDraft = useRef({
    assessmentId: "",
    response: "",
    recommendation: "",
    recipe: "",
  });

  useEffect(() => {
    let active = true;
    void apiRequest<{ allowed: true }>("/api/reviewer/access")
      .then(() => {
        if (active) setAccess("allowed");
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Could not verify reviewer access.";
        if (message.includes("does not have reviewer access")) {
          setAccess("denied");
          return;
        }
        setAccessError(message);
        setAccess("error");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (access !== "allowed") return;
    let active = true;
    setQueueLoading(true);
    setQueueError("");
    void apiRequest<QueueResponse>(`/api/reviewer/assessments?page=${page}`)
      .then((result) => {
        if (!active) return;
        setQueue(result.assessments);
        setTotal(result.total);
      })
      .catch((error: unknown) => {
        if (active) setQueueError(error instanceof Error ? error.message : "Could not load submitted assessments.");
      })
      .finally(() => {
        if (active) setQueueLoading(false);
      });
    return () => { active = false; };
  }, [access, page, queueReloadKey]);

  const persistDraft = useCallback(
    (assessmentId: string, response: string, recommendation: string, recipe: string) => {
      setDraftSaveState("saving");
      setDraftError("");
      const request = saveQueue.current.then(async () => {
        await apiRequest<{ review: ReviewRecord }>(`/api/reviewer/assessments/${assessmentId}/draft`, {
          method: "PATCH",
          body: JSON.stringify({
            responseDraft: response,
            recommendationDraft: recommendation,
            selectedRecipe: recipe,
          }),
        });
        const latest = latestDraft.current;
        if (
          latest.assessmentId === assessmentId &&
          latest.response === response &&
          latest.recommendation === recommendation &&
          latest.recipe === recipe
        ) {
          setDraftDirty(false);
          setDraftSaveState("saved");
        }
      });
      saveQueue.current = request.then(() => undefined, () => undefined);
      return request.catch((error: unknown) => {
        const latest = latestDraft.current;
        if (
          latest.assessmentId === assessmentId &&
          latest.response === response &&
          latest.recommendation === recommendation &&
          latest.recipe === recipe
        ) {
          setDraftSaveState("error");
          setDraftError(error instanceof Error ? error.message : "Could not save this review draft.");
        }
        throw error;
      });
    },
    [],
  );

  useEffect(() => {
    const review = selected?.review;
    if (
      !reviewOpen ||
      !selected ||
      !draftDirty ||
      review?.status !== "in_progress" ||
      review.assignment !== "you"
    ) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persistDraft(selected.assessment.id, responseDraft, recommendationDraft, selectedRecipe).catch(() => undefined);
      saveTimer.current = null;
    }, 650);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [draftDirty, persistDraft, recommendationDraft, responseDraft, reviewOpen, selected, selectedRecipe]);

  useEffect(() => () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
  }, []);

  function setDrafts(detail: ReviewerAssessmentDetail) {
    const response = detail.review?.responseDraft ?? "";
    const recommendation = detail.review?.recommendationDraft ?? "";
    const recipe = detail.review?.selectedRecipe ?? "";
    latestDraft.current = {
      assessmentId: detail.assessment.id,
      response,
      recommendation,
      recipe,
    };
    setResponseDraft(response);
    setRecommendationDraft(recommendation);
    setSelectedRecipe(recipe);
    setDraftDirty(false);
    setDraftSaveState("saved");
    setDraftError("");
    setReviewError("");
    setPreviewed(false);
  }

  async function fetchDetail(id: string) {
    return apiRequest<ReviewerAssessmentDetail>(`/api/reviewer/assessments/${id}`);
  }

  async function openSubmissionDetails(id: string) {
    setOpeningId(id);
    setOpenError("");
    try {
      const detail = await fetchDetail(id);
      setSelected(detail);
      setDetailsOpen(true);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : "Could not load this submission.");
    } finally {
      setOpeningId(null);
    }
  }

  async function openReview(id: string) {
    const queueItem = queue.find((assessment) => assessment.id === id);
    if (queueItem?.reviewStatus === "in_progress" && queueItem.assignment === "another_reviewer") return;
    setOpeningId(id);
    setOpenError("");
    try {
      if (queueItem?.reviewStatus === "needs_review") {
        await apiRequest<{ review: ReviewRecord }>(`/api/reviewer/assessments/${id}/start`, {
          method: "POST",
        });
      }
      const detail = await fetchDetail(id);
      setSelected(detail);
      setDrafts(detail);
      setReviewOpen(true);
      setDetailsOpen(false);
      setQueueReloadKey((key) => key + 1);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : "Could not open this review.");
    } finally {
      setOpeningId(null);
    }
  }

  function updateDraft(field: "response" | "recommendation" | "recipe", value: string) {
    const next = {
      ...latestDraft.current,
      [field]: value,
    };
    latestDraft.current = next;
    if (field === "response") setResponseDraft(value);
    else if (field === "recommendation") setRecommendationDraft(value);
    else setSelectedRecipe(value);
    setDraftDirty(true);
    setDraftSaveState("pending");
    setDraftError("");
    setPreviewed(false);
  }

  async function saveDraftNow() {
    if (!selected || !draftDirty) return;
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await persistDraft(selected.assessment.id, responseDraft, recommendationDraft, selectedRecipe);
  }

  async function closeReview() {
    try {
      await saveDraftNow();
      setReviewOpen(false);
      setQueueReloadKey((key) => key + 1);
    } catch {
      return;
    }
  }

  async function openDetailsFromReview() {
    try {
      await saveDraftNow();
      setReviewOpen(false);
      setDetailsOpen(true);
    } catch {
      return;
    }
  }

  async function completeReview() {
    if (!selected || !responseDraft.trim() || !recommendationDraft.trim()) {
      setReviewError("Add a participant response and recommendation before completing the review.");
      return;
    }
    try {
      await saveDraftNow();
      const { review } = await apiRequest<{ review: ReviewRecord }>(
        `/api/reviewer/assessments/${selected.assessment.id}/complete`,
        { method: "POST" },
      );
      setSelected((current) => current
        ? { ...current, review }
        : current);
      setDraftDirty(false);
      setDraftSaveState("saved");
      setReviewError("");
      setPreviewed(false);
      setQueueReloadKey((key) => key + 1);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Could not complete this review.");
    }
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

  const pageCount = Math.max(1, Math.ceil(total / 25));
  const editable = selected?.review?.status === "in_progress" && selected.review.assignment === "you";
  const reviewIsComplete = selected?.review?.status === "completed";
  const groupedQuestionAnswers = selected
    ? groupReviewerQuestionAnswers(selected.assessment.questionAnswers)
    : [];
  const visibleQuestionCount = groupedQuestionAnswers.reduce((count, group) => count + group.answers.length, 0);

  return (
    <main className="reviewer-workspace reviewer-live-workspace">
      <div className="reviewer-topline">
        <Link className="reviewer-back-link" to="/dashboard"><ArrowLeft size={15} /> Dashboard</Link>
        <Badge className="reviewer-live-badge"><ShieldCheck size={12} /> PRIVATE SUBMISSIONS</Badge>
      </div>
      <section className="reviewer-heading">
        <div>
          <span className="eyebrow">HUMAN REVIEW WORKSPACE</span>
          <h1>Submitted assessments</h1>
          <p>Review completed conversations and their question-by-question responses.</p>
        </div>
        <Badge className="account-role-badge role-reviewer"><ShieldCheck size={13} /> Reviewer access</Badge>
      </section>
      <div className="reviewer-live-notice" role="note">
        Only completed submissions appear here. TPB construct cues are experimental model estimates, while readiness uses phrase-matched intention answers; review the participant’s own words before making a decision. Reviewer drafts are internal and are never sent to the participant.
      </div>

      <section className="reviewer-queue-shell" aria-label="Completed assessment submissions">
        <div className="reviewer-queue-title">
          <div><span className="eyebrow">SUBMISSION QUEUE</span><h2>Completed assessments</h2></div>
          <Badge>{total} submissions</Badge>
        </div>
        {openError && <p className="form-error" role="alert">{openError}</p>}
        {queueLoading && (
          <div className="reviewer-live-loading" role="status">
            <LoaderCircle size={17} className="auth-spinner" /> Loading completed submissions…
          </div>
        )}
        {queueError && (
          <div className="reviewer-live-error">
            <p role="alert">{queueError}</p>
            <Button variant="outline" size="sm" onClick={() => setQueueReloadKey((key) => key + 1)}>Try again</Button>
          </div>
        )}
        {!queueLoading && !queueError && queue.length === 0 && (
          <div className="reviewer-live-empty">
            <ClipboardCheck size={20} />
            <strong>No completed submissions yet</strong>
            <p>Assessments will appear here after the participant completes all questions.</p>
          </div>
        )}
        {!queueLoading && !queueError && queue.length > 0 && (
          <div className="reviewer-case-list">
            {queue.map((assessment) => {
              const blockedByOtherReviewer = assessment.reviewStatus === "in_progress" && assessment.assignment === "another_reviewer";
              const primaryLabel = assessment.reviewStatus === "completed"
                ? "View review"
                : assessment.reviewStatus === "in_progress"
                  ? blockedByOtherReviewer ? "Assigned" : "Continue review"
                  : "Review";
              return (
                <article className="reviewer-case-row reviewer-live-case-row" key={assessment.id}>
                  <div className="reviewer-case-avatar"><FileText size={17} /></div>
                  <div className="reviewer-case-row-main">
                    <div className="reviewer-case-row-title">
                      <strong>Submission {assessment.id.slice(0, 8).toUpperCase()}</strong>
                      <Badge className={`reviewer-status-badge ${statusClass(assessment.reviewStatus)}`}>
                        {reviewStatusLabel(assessment.reviewStatus)}
                      </Badge>
                      <Badge className="reviewer-assignee-badge">
                        <UsersRound size={11} /> {assignmentLabel(assessment.assignment)}
                      </Badge>
                    </div>
                    <p><CalendarDays size={12} /> Submitted {formatDate(assessment.submittedAt)}</p>
                    <small>{assessment.answered} of {assessment.total} answers recorded</small>
                    <div className="reviewer-case-summary" aria-label="Provisional assessment cues">
                      <span className="reviewer-case-result"><CircleDot size={13} /><span>Readiness</span><strong>{profileStage(assessment.profile)}</strong></span>
                      <span className="reviewer-case-result"><BarChart3 size={13} /><span>Lowest estimate</span><strong>{profileWeakest(assessment.profile)}</strong></span>
                    </div>
                  </div>
                  <div className="reviewer-case-row-actions">
                    <Button
                      className="button button-dark"
                      disabled={openingId === assessment.id || blockedByOtherReviewer}
                      title={blockedByOtherReviewer ? "This case is assigned to another reviewer." : undefined}
                      onClick={() => void openReview(assessment.id)}
                    >
                      {openingId === assessment.id
                        ? <LoaderCircle size={14} className="auth-spinner" />
                        : assessment.reviewStatus === "completed" ? <Eye size={14} /> : <ClipboardCheck size={14} />}
                      {primaryLabel}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={openingId === assessment.id}
                      onClick={() => void openSubmissionDetails(assessment.id)}
                    >
                      <MessageSquareText size={14} /> View submission
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {pageCount > 1 && (
          <div className="reviewer-live-pagination" aria-label="Submission pages">
            <span>Page {page} of {pageCount}</span>
            <div>
              <Button variant="outline" size="sm" disabled={page <= 1 || queueLoading} onClick={() => setPage((value) => value - 1)}>
                <ArrowLeft size={13} /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pageCount || queueLoading} onClick={() => setPage((value) => value + 1)}>
                Next <ArrowRight size={13} />
              </Button>
            </div>
          </div>
        )}
        <p className="reviewer-queue-footnote">Assessment IDs are shortened in the queue. Opening a submission shows the full chat and saved answers.</p>
      </section>

      <Dialog
        open={reviewOpen}
        onOpenChange={(open) => {
          if (!open) void closeReview();
        }}
      >
        {reviewOpen && selected && (
          <DialogContent className="reviewer-review-dialog reviewer-live-review-dialog">
            <div className="reviewer-review-heading">
              <div>
                <span className="eyebrow">SUBMITTED ASSESSMENT</span>
                <DialogTitle>Review {selected.assessment.id.slice(0, 8).toUpperCase()}</DialogTitle>
              </div>
              <div className="reviewer-workflow-badges">
                <Badge className={`reviewer-status-badge ${statusClass(selected.review?.status ?? "needs_review")}`}>
                  {reviewStatusLabel(selected.review?.status ?? "needs_review")}
                </Badge>
                <Badge className="reviewer-assignee-badge"><UsersRound size={11} /> {assignmentLabel(selected.review?.assignment ?? null)}</Badge>
              </div>
            </div>
            <DialogDescription>Review the provisional summary and the participant’s own words before writing any internal response.</DialogDescription>
            <div className={`reviewer-draft-save-state${draftSaveState === "error" ? " has-error" : ""}`}>
              {draftSaveState === "saving" || draftSaveState === "pending"
                ? <LoaderCircle size={14} className="auth-spinner" />
                : draftSaveState === "saved" ? <Check size={14} /> : null}
              <span>{draftSaveState === "saving" ? "Saving draft…" : draftSaveState === "pending" ? "Draft changes pending" : draftSaveState === "error" ? "Draft not saved" : "Draft saved in Supabase"}</span>
              <small>Internal only · never sent to the participant</small>
            </div>
            <div className="reviewer-dialog-scroll reviewer-review-form">
              <section className="reviewer-review-summary" aria-label="Assessment summary">
                <div className="reviewer-review-summary-heading">
                  <div>
                    <span className="eyebrow"><BarChart3 size={13} /> ASSESSMENT AT A GLANCE</span>
                    <strong>{selected.assessment.answered} of {selected.assessment.total} answers · Submitted {formatDate(selected.assessment.submittedAt)}</strong>
                  </div>
                </div>
                <div className="reviewer-live-summary-metrics">
                  <div><span>Readiness stage</span><strong><CircleDot size={14} /> {profileStage(selected.assessment.profile)}</strong></div>
                  <div><span>Lowest supported signal</span><strong><BarChart3 size={14} /> {profileWeakest(selected.assessment.profile)}</strong></div>
                </div>
                <p className="reviewer-review-summary-note">Experimental TPB model estimates and provisional intention-based readiness only; not validated scores or clinical classifications.</p>
                <Button variant="outline" className="reviewer-more-details-action" onClick={() => void openDetailsFromReview()}>
                  <MessageSquareText size={14} /> Open chat and question details
                </Button>
              </section>

              {editable ? (
                <>
                  <div className="reviewer-guidance-note" role="note">
                    <span className="reviewer-guidance-icon"><Sparkles size={16} /></span>
                    <div className="reviewer-guidance-content">
                      <div className="reviewer-guidance-badges">
                        <Badge className="reviewer-cue-badge"><Sparkles size={11} /> Reviewer cue</Badge>
                        <Badge className="reviewer-cue-context-badge"><CircleDot size={11} /> TTM {profileStage(selected.assessment.profile)}</Badge>
                        <Badge className="reviewer-cue-context-badge"><BarChart3 size={11} /> {profileWeakest(selected.assessment.profile)}</Badge>
                      </div>
                      <span>Use this as context for your own writing, not as a ready-to-send response or recommendation.</span>
                    </div>
                  </div>
                  <label className="reviewer-author-field" htmlFor="live-review-response">
                    <span className="reviewer-field-heading"><span><MessageSquareText size={14} /> Internal participant response draft</span><small>Not sent</small></span>
                    <textarea
                      id="live-review-response"
                      rows={4}
                      maxLength={5000}
                      value={responseDraft}
                      onChange={(event) => updateDraft("response", event.target.value)}
                      placeholder="Write a supportive reply that reflects what the participant shared."
                    />
                  </label>
                  <label className="reviewer-author-field" htmlFor="live-review-recommendation">
                    <span className="reviewer-field-heading"><span><BarChart3 size={14} /> Internal recommendation draft</span><small>One practical next step</small></span>
                    <textarea
                      id="live-review-recommendation"
                      rows={3}
                      maxLength={5000}
                      value={recommendationDraft}
                      onChange={(event) => updateDraft("recommendation", event.target.value)}
                      placeholder="Write one practical next step."
                    />
                  </label>
                  <ReviewerRecipePicker
                    onSelect={(recipe) => {
                      updateDraft("recipe", formatRecipeRecommendation(recipe));
                      setReviewError("");
                      return true;
                    }}
                  />
                  {!previewed && (
                    <p className="reviewer-review-footer-note" role="note">
                      Preview the response, selected recipe, and recommendation to enable sending.
                    </p>
                  )}
                  {draftError && <p className="form-error" role="alert">{draftError}</p>}
                  {reviewError && <p className="form-error" role="alert">{reviewError}</p>}
                  {previewed && (
                    <section className="reviewer-preview" aria-label="Review draft preview">
                      <span className="eyebrow"><Eye size={13} /> PARTICIPANT PREVIEW · NOT SENT</span>
                      <p>{responseDraft}</p>
                      {selectedRecipe && <p><strong>Chosen dish:</strong><br />{selectedRecipe}</p>}
                      <p><strong>Recommendation:</strong> {recommendationDraft}</p>
                    </section>
                  )}
                </>
              ) : (
                <section className="reviewer-live-saved-review">
                  <h3>{reviewIsComplete ? "Completed reviewer notes" : "Review status"}</h3>
                  {reviewIsComplete ? (
                    <>
                      <div><strong>Response draft</strong><p>{selected.review?.responseDraft || "No response draft saved."}</p></div>
                      {selected.review?.selectedRecipe && <div><strong>Chosen dish</strong><p>{selected.review.selectedRecipe}</p></div>}
                      <div><strong>Recommendation draft</strong><p>{selected.review?.recommendationDraft || "No recommendation draft saved."}</p></div>
                    </>
                  ) : (
                    <p>This submission is not assigned to you, so its reviewer draft is not shown.</p>
                  )}
                </section>
              )}
            </div>
            <div className="reviewer-review-footer">
              <p className="reviewer-review-footer-note">
                {editable
                  ? previewed ? "Preview checked. Sending makes this response available in the participant’s private dashboard." : "Preview the participant response before sending it."
                  : reviewIsComplete ? `Delivered to the participant’s dashboard${selected.review?.deliveredAt ? ` on ${formatDate(selected.review.deliveredAt)}` : ""}.` : "Read-only submission summary."}
              </p>
              <div className="reviewer-review-actions">
                {editable ? (
                  <>
                    <div className="reviewer-review-action-group">
                      <Button variant="outline" onClick={() => void saveDraftNow()} disabled={!draftDirty || draftSaveState === "saving"}>
                        <Save size={15} /> Save now
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (!responseDraft.trim() || !recommendationDraft.trim()) {
                            setReviewError("Add both drafts before previewing.");
                            return;
                          }
                          setReviewError("");
                          setPreviewed(true);
                        }}
                      >
                        <Eye size={15} /> Preview
                      </Button>
                    </div>
                    <Button className="button button-dark" onClick={() => void completeReview()} disabled={!previewed || draftSaveState === "saving"}>
                      <Send size={15} /> Send to participant
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={() => void closeReview()}>Close</Button>
                )}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        {detailsOpen && selected && (
          <DialogContent className="reviewer-details-dialog reviewer-live-details-dialog">
            <span className="eyebrow">SUBMITTED ASSESSMENT · {selected.assessment.id.slice(0, 8).toUpperCase()}</span>
            <DialogTitle>Chat and answers</DialogTitle>
            <DialogDescription>
              {selected.assessment.answered} of {selected.assessment.total} responses · Submitted {formatDate(selected.assessment.submittedAt)}
            </DialogDescription>
            <div className="reviewer-dialog-scroll reviewer-live-details-scroll">
              <section className="reviewer-live-chat" aria-label="Saved chat transcript">
                <div className="reviewer-live-section-heading">
                  <div><span className="eyebrow">CONVERSATION</span><h3>Saved chat transcript</h3></div>
                  <Badge>{selected.assessment.messages.length} messages</Badge>
                </div>
                {selected.assessment.messages.length === 0 ? (
                  <p className="reviewer-live-muted">No chat messages were saved for this submission.</p>
                ) : (
                  <div className="reviewer-live-message-list">
                    {selected.assessment.messages.map((message) => (
                      <article className={`reviewer-live-message message-${message.sender}`} key={message.id}>
                        <strong>{message.sender === "bot" ? "AliMind" : "Participant"}</strong>
                        <p>{message.text}</p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <section className="reviewer-live-answers" aria-label="Question-by-question answers">
                <div className="reviewer-live-section-heading">
                  <div><span className="eyebrow">ASSESSMENT RESPONSES</span><h3>Answers by TPB construct</h3></div>
                  <Badge>{visibleQuestionCount} questions · Section 10 omitted</Badge>
                </div>
                <p className="reviewer-live-muted" role="note">
                  This saved submission contains the legacy TPB questionnaire only. Pilot TTM screening and additional-question answers are not yet part of the live assessment response data.
                </p>
                <div className="reviewer-live-answer-list">
                  {groupedQuestionAnswers.map((group) => (
                    <details key={group.construct}>
                      <summary>
                        <span>{group.label}</span>
                        <small>{group.sectionsLabel} · {group.answers.length} questions</small>
                      </summary>
                      <div className="reviewer-live-construct-answers">
                        {group.answers.map((item) => (
                          <details key={`${item.questionNumber}-${item.questionId}`}>
                            <summary>
                              <span>Q{item.questionNumber} · {item.prompt ?? "Question prompt unavailable for this version"}</span>
                              <small>{item.response === null ? "Skipped" : "Answered"}</small>
                            </summary>
                            <p>{item.response ?? "No response recorded."}</p>
                            {item.tpbModelRating !== null && item.tpbModelRating !== undefined && (
                              <small>Experimental BERT TPB estimate: {item.tpbModelRating.toFixed(2)}/7</small>
                            )}
                            {item.score !== null && <small>Prototype phrase-match score: {item.score}/100 · provisional only</small>}
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            </div>
            <div className="reviewer-dialog-actions">
              <Button variant="outline" onClick={() => setDetailsOpen(false)}>Close details</Button>
              {selected.review?.status !== "completed" && selected.review?.assignment !== "another_reviewer" && (
                <Button className="button button-dark" onClick={() => void openReview(selected.assessment.id)}>
                  <ClipboardCheck size={14} />
                  {selected.review?.status === "in_progress" ? "Continue review" : "Start review"}
                </Button>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
      <p className="reviewer-footnote">Completed responses are delivered privately to the participant’s dashboard. Reviewer notes remain internal.</p>
    </main>
  );
}
