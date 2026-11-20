import { describe, expect, it } from "vitest";
import {
  clearKnownPrefillText,
  createEmptyReviewDraft,
  loadReviewDrafts,
  saveReviewDrafts,
  type ReviewDraftStorage,
  type ReviewDrafts,
} from "./reviewer-drafts";

class MemoryStorage implements ReviewDraftStorage {
  private value: string | null = null;

  getItem() {
    return this.value;
  }

  setItem(_key: string, value: string) {
    this.value = value;
  }
}

function createDefaults(): ReviewDrafts {
  return {
    "SAMPLE-1042": createEmptyReviewDraft(),
    "SAMPLE-1038": createEmptyReviewDraft(),
  };
}

describe("reviewer review drafts", () => {
  it("persists each case draft independently and restores it", () => {
    const storage = new MemoryStorage();
    const defaults = createDefaults();
    const drafts = {
      ...defaults,
      "SAMPLE-1038": {
        ...defaults["SAMPLE-1038"],
        response: "A saved participant response.",
        recommendation: "A saved next step.",
        updatedAt: "2026-11-15T01:00:00.000Z",
      },
    };

    expect(saveReviewDrafts(storage, drafts)).toBe("");
    expect(loadReviewDrafts(storage, defaults)).toEqual({ drafts, error: "" });
  });

  it("clears legacy starter text without removing reviewer-written draft text", () => {
    const defaults = createDefaults();
    const drafts = {
      ...defaults,
      "SAMPLE-1042": {
        response: "Old starter response",
        recommendation: "Reviewer chose this recipe.",
        updatedAt: "2026-11-15T01:00:00.000Z",
      },
      "SAMPLE-1038": {
        response: "Old starter response B",
        recommendation: "Old starter recommendation B",
        updatedAt: "2026-11-15T02:00:00.000Z",
      },
    };

    expect(clearKnownPrefillText(drafts, {
      "SAMPLE-1042": {
        response: "Old starter response",
        recommendation: "Old starter recommendation",
      },
      "SAMPLE-1038": {
        response: "Old starter response B",
        recommendation: "Old starter recommendation B",
      },
    })).toEqual({
      ...defaults,
      "SAMPLE-1042": {
        response: "",
        recommendation: "Reviewer chose this recipe.",
        updatedAt: "2026-11-15T01:00:00.000Z",
      },
      "SAMPLE-1038": createEmptyReviewDraft(),
    });
  });

  it("reports invalid stored data instead of silently treating it as a valid draft", () => {
    const storage = new MemoryStorage();
    storage.setItem("alimind.reviewer-review-drafts.v2", "{invalid json");

    const result = loadReviewDrafts(storage, createDefaults());

    expect(result.drafts).toEqual(createDefaults());
    expect(result.error).toContain("Could not load saved review drafts");
  });

  it("surfaces browser storage write failures", () => {
    const storage: ReviewDraftStorage = {
      getItem: () => null,
      setItem: () => { throw new Error("Storage is unavailable."); },
    };

    expect(saveReviewDrafts(storage, createDefaults())).toContain("Storage is unavailable.");
  });
});
