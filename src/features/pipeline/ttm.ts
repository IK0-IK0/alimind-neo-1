import type { TTMStage } from "../assessment/scoring";

export type YesNoAnswer = boolean | null;

export type TtmScreeningAnswers = {
  currentlyFollowingHealthyPattern: YesNoAnswer;
  followingForMoreThanOneMonth: YesNoAnswer;
  intendsToStartWithinOneMonth: YesNoAnswer;
  intendsToStartWithinOneWeek: YesNoAnswer;
};

export type TtmStageClassification =
  | { status: "incomplete"; stage: TTMStage | null; reason: string }
  | { status: "classified"; stage: TTMStage; reason: string };

export const EMPTY_TTM_SCREENING_ANSWERS: TtmScreeningAnswers = {
  currentlyFollowingHealthyPattern: null,
  followingForMoreThanOneMonth: null,
  intendsToStartWithinOneMonth: null,
  intendsToStartWithinOneWeek: null,
};

export function classifyTtmStage(answers: TtmScreeningAnswers): TtmStageClassification {
  if (answers.currentlyFollowingHealthyPattern === null) {
    return {
      status: "incomplete",
      stage: null,
      reason: "Answer whether you currently follow the healthy eating pattern.",
    };
  }

  if (answers.currentlyFollowingHealthyPattern) {
    if (answers.followingForMoreThanOneMonth === null) {
      return {
        status: "incomplete",
        stage: "Action",
        reason: "Answer how long you have followed the healthy eating pattern.",
      };
    }
    return answers.followingForMoreThanOneMonth
      ? {
          status: "classified",
          stage: "Maintenance",
          reason: "Currently following the pattern for more than one month.",
        }
      : {
          status: "classified",
          stage: "Action",
          reason: "Currently following the pattern for one month or less.",
        };
  }

  if (answers.intendsToStartWithinOneMonth === null) {
    return {
      status: "incomplete",
      stage: "Pre-contemplation",
      reason: "Answer whether you intend to start in the next month.",
    };
  }
  if (!answers.intendsToStartWithinOneMonth) {
    return {
      status: "classified",
      stage: "Pre-contemplation",
      reason: "Not currently following the pattern and no intention to start in the next month.",
    };
  }
  if (answers.intendsToStartWithinOneWeek === null) {
    return {
      status: "incomplete",
      stage: "Contemplation",
      reason: "Answer whether you intend to start in the next week.",
    };
  }
  return answers.intendsToStartWithinOneWeek
    ? {
        status: "classified",
        stage: "Preparation",
        reason: "Intends to start within the next week.",
      }
    : {
        status: "classified",
        stage: "Contemplation",
        reason: "Intends to start within the next month, but not within the next week.",
      };
}

export function createTtmAnswersFromResponses(
      answers: readonly { questionId: string; response: string | null }[],
): TtmScreeningAnswers {
      const responseById = new Map(
        answers.map((answer) => [answer.questionId, answer.response]),
      );
      const booleanResponse = (questionId: string): boolean | null => {
        const response = responseById.get(questionId)?.trim().toLowerCase();
        if (response === "yes") return true;
        if (response === "no") return false;
        return null;
      };

      return {
        currentlyFollowingHealthyPattern: booleanResponse("pilot-ttm-63"),
        followingForMoreThanOneMonth: booleanResponse("pilot-ttm-64"),
        intendsToStartWithinOneMonth: booleanResponse("pilot-ttm-65"),
        intendsToStartWithinOneWeek: booleanResponse("pilot-ttm-66"),
      };
}

export function createTtmScenarioAnswers(stage: TTMStage): TtmScreeningAnswers {
  switch (stage) {
    case "Pre-contemplation":
      return {
        ...EMPTY_TTM_SCREENING_ANSWERS,
        currentlyFollowingHealthyPattern: false,
        intendsToStartWithinOneMonth: false,
      };
    case "Contemplation":
      return {
        ...EMPTY_TTM_SCREENING_ANSWERS,
        currentlyFollowingHealthyPattern: false,
        intendsToStartWithinOneMonth: true,
        intendsToStartWithinOneWeek: false,
      };
    case "Preparation":
      return {
        ...EMPTY_TTM_SCREENING_ANSWERS,
        currentlyFollowingHealthyPattern: false,
        intendsToStartWithinOneMonth: true,
        intendsToStartWithinOneWeek: true,
      };
    case "Action":
      return {
        ...EMPTY_TTM_SCREENING_ANSWERS,
        currentlyFollowingHealthyPattern: true,
        followingForMoreThanOneMonth: false,
      };
    case "Maintenance":
      return {
        ...EMPTY_TTM_SCREENING_ANSWERS,
        currentlyFollowingHealthyPattern: true,
        followingForMoreThanOneMonth: true,
      };
  }
}
