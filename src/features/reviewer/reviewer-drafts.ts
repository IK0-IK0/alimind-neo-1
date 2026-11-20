export interface ReviewDraft {
  response: string;
  recommendation: string;
  updatedAt: string | null;
}

export type ReviewDrafts = Record<string, ReviewDraft>;

export interface ReviewDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ReviewDraftLoadResult {
  drafts: ReviewDrafts;
  error: string;
}

const REVIEW_DRAFTS_STORAGE_KEY = "alimind.reviewer-review-drafts.v2";

export function createEmptyReviewDraft(): ReviewDraft {
  return {
    response: "",
    recommendation: "",
    updatedAt: null,
  };
}

export function clearKnownPrefillText(
  drafts: ReviewDrafts,
  prefills: Record<string, Pick<ReviewDraft, "response" | "recommendation">>,
): ReviewDrafts {
  const updatedDrafts = { ...drafts };
  for (const [caseId, prefill] of Object.entries(prefills)) {
    const savedDraft = drafts[caseId];
    if (!savedDraft) continue;

    const response = savedDraft.response === prefill.response ? "" : savedDraft.response;
    const recommendation = savedDraft.recommendation === prefill.recommendation
      ? ""
      : savedDraft.recommendation;
    if (response !== savedDraft.response || recommendation !== savedDraft.recommendation) {
      updatedDrafts[caseId] = {
        response,
        recommendation,
        updatedAt: response || recommendation ? savedDraft.updatedAt : null,
      };
    }
  }
  return updatedDrafts;
}

export function loadReviewDrafts(
  storage: ReviewDraftStorage,
  defaults: ReviewDrafts,
): ReviewDraftLoadResult {
  try {
    const storedDrafts = storage.getItem(REVIEW_DRAFTS_STORAGE_KEY);
    if (!storedDrafts) return { drafts: defaults, error: "" };

    const parsed: unknown = JSON.parse(storedDrafts);
    if (!isRecord(parsed)) throw new Error("Saved drafts have an invalid format.");

    const drafts = { ...defaults };
    for (const caseId of Object.keys(defaults)) {
      const savedDraft = parsed[caseId];
      if (savedDraft === undefined) continue;
      if (!isReviewDraft(savedDraft)) {
        throw new Error(`The saved draft for ${caseId} is invalid.`);
      }
      drafts[caseId] = savedDraft;
    }

    return { drafts, error: "" };
  } catch (error) {
    return {
      drafts: defaults,
      error: `Could not load saved review drafts: ${errorMessage(error)}`,
    };
  }
}

export function saveReviewDrafts(storage: ReviewDraftStorage, drafts: ReviewDrafts): string {
  try {
    storage.setItem(REVIEW_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    return "";
  } catch (error) {
    return `Could not save this review draft in the browser: ${errorMessage(error)}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReviewDraft(value: unknown): value is ReviewDraft {
  if (!isRecord(value)) return false;
  return (
    typeof value.response === "string" &&
    typeof value.recommendation === "string" &&
    (typeof value.updatedAt === "string" || value.updatedAt === null)
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown storage error.";
}
