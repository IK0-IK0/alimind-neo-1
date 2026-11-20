import { describe, expect, it } from "vitest";
import {
  classifyTtmStage,
  createTtmAnswersFromResponses,
  createTtmScenarioAnswers,
  EMPTY_TTM_SCREENING_ANSWERS,
} from "./ttm";
import type { TTMStage } from "../assessment/scoring";

describe("TTM quick-screen decision tree", () => {
  const cases: Array<[TTMStage, string]> = [
    ["Pre-contemplation", "Not currently following the pattern and no intention to start in the next month."],
    ["Contemplation", "Intends to start within the next month, but not within the next week."],
    ["Preparation", "Intends to start within the next week."],
    ["Action", "Currently following the pattern for one month or less."],
    ["Maintenance", "Currently following the pattern for more than one month."],
  ];

  it.each(cases)("classifies the %s decision-tree branch", (stage, reason) => {
    expect(classifyTtmStage(createTtmScenarioAnswers(stage))).toEqual({
      status: "classified",
      stage,
      reason,
    });
  });

  it("requires only answers relevant to the selected branch", () => {
    expect(classifyTtmStage({
      ...EMPTY_TTM_SCREENING_ANSWERS,
      currentlyFollowingHealthyPattern: true,
      followingForMoreThanOneMonth: true,
    }).stage).toBe("Maintenance");
    expect(classifyTtmStage({
      ...EMPTY_TTM_SCREENING_ANSWERS,
      currentlyFollowingHealthyPattern: false,
      intendsToStartWithinOneMonth: false,
    }).stage).toBe("Pre-contemplation");
  });

  it("shows a provisional stage while waiting for the next branch answer", () => {
    expect(classifyTtmStage(EMPTY_TTM_SCREENING_ANSWERS).status).toBe("incomplete");
    expect(classifyTtmStage({
      ...EMPTY_TTM_SCREENING_ANSWERS,
      currentlyFollowingHealthyPattern: true,
    })).toMatchObject({ status: "incomplete", stage: "Action" });
    expect(classifyTtmStage({
      ...EMPTY_TTM_SCREENING_ANSWERS,
      currentlyFollowingHealthyPattern: false,
    })).toMatchObject({ status: "incomplete", stage: "Pre-contemplation" });
    expect(classifyTtmStage({
      ...EMPTY_TTM_SCREENING_ANSWERS,
      currentlyFollowingHealthyPattern: false,
      intendsToStartWithinOneMonth: true,
    })).toMatchObject({ status: "incomplete", stage: "Contemplation" });
  });

  it("reclassifies when the first answer changes without altering the other answers", () => {
    const answers = {
      currentlyFollowingHealthyPattern: false,
      followingForMoreThanOneMonth: true,
      intendsToStartWithinOneMonth: true,
      intendsToStartWithinOneWeek: true,
    };

    expect(classifyTtmStage(answers).stage).toBe("Preparation");
    const changedFirstAnswer = {
      ...answers,
      currentlyFollowingHealthyPattern: true,
      followingForMoreThanOneMonth: false,
    };
    expect(classifyTtmStage(changedFirstAnswer).stage).toBe("Action");
    expect(changedFirstAnswer.intendsToStartWithinOneMonth).toBe(true);
    expect(changedFirstAnswer.intendsToStartWithinOneWeek).toBe(true);
  });

  it("maps live yes/no responses onto the applicable TTM branch", () => {
    const answers = createTtmAnswersFromResponses([
      { questionId: "pilot-ttm-63", response: "No" },
      { questionId: "pilot-ttm-65", response: "Yes" },
      { questionId: "pilot-ttm-66", response: "No" },
    ]);

    expect(classifyTtmStage(answers)).toMatchObject({
      status: "classified",
      stage: "Contemplation",
    });
    expect(answers.followingForMoreThanOneMonth).toBeNull();
  });
});
