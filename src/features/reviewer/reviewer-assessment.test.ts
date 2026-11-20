import { describe, expect, it } from "vitest";
import { QUESTIONS } from "../../data/questionnaire";
import { makeAnswer } from "../assessment/scoring";
import {
  calculateReviewerProfile,
  groupReviewerQuestionAnswers,
  getReviewerQuestionAnswers,
  summarizeReviewerProfile,
} from "./reviewer-assessment";

describe("reviewer assessment mapping", () => {
  it("matches stored answers to shuffled question order and prompts", () => {
    const questionOrder = QUESTIONS.slice(0, 3).reverse().map(({ id }) => id);
    const answers = questionOrder.map((id) => {
      const question = QUESTIONS.find((item) => item.id === id)!;
      return makeAnswer(question, question.keywords[100][0]);
    });

    expect(getReviewerQuestionAnswers(questionOrder, answers)).toEqual([
      {
        questionId: questionOrder[0],
        questionNumber: 1,
        section: QUESTIONS.find(({ id }) => id === questionOrder[0])?.section ?? null,
        prompt: QUESTIONS.find(({ id }) => id === questionOrder[0])?.prompt,
        response: answers[0].response,
        score: answers[0].score,
      },
      {
        questionId: questionOrder[1],
        questionNumber: 2,
        section: QUESTIONS.find(({ id }) => id === questionOrder[1])?.section ?? null,
        prompt: QUESTIONS.find(({ id }) => id === questionOrder[1])?.prompt,
        response: answers[1].response,
        score: answers[1].score,
      },
      {
        questionId: questionOrder[2],
        questionNumber: 3,
        section: QUESTIONS.find(({ id }) => id === questionOrder[2])?.section ?? null,
        prompt: QUESTIONS.find(({ id }) => id === questionOrder[2])?.prompt,
        response: answers[2].response,
        score: answers[2].score,
      },
    ]);
    const profile = calculateReviewerProfile(questionOrder, answers);
    expect(profile?.answered).toBe(3);
    expect(summarizeReviewerProfile(profile)).toEqual({
      stage: profile?.stage,
      weakest: profile?.weakest,
      answered: profile?.answered,
      total: profile?.total,
    });
  });

  it("keeps answers visible when a question prompt is from an unknown version", () => {
    expect(calculateReviewerProfile(["retired-question"], [])).toBeNull();
    expect(getReviewerQuestionAnswers(["retired-question"], [
      { questionId: "retired-question", response: "Some answer", score: null },
    ])).toEqual([
      {
        questionId: "retired-question",
        questionNumber: 1,
        section: null,
        prompt: null,
        response: "Some answer",
        score: null,
      },
    ]);
  });

  it("includes the experimental TPB model rating in reviewer details", () => {
    const question = QUESTIONS.find((item) => item.construct === "attitude")!;
    expect(getReviewerQuestionAnswers([question.id], [{
      questionId: question.id,
      response: "A response",
      score: null,
      tpbModelRating: 5.25,
    }])).toMatchObject([{ questionId: question.id, tpbModelRating: 5.25 }]);
  });

  it("marks unselected TTM branches as not asked in reviewer details", () => {
    expect(getReviewerQuestionAnswers(
      ["pilot-ttm-63", "pilot-ttm-64", "pilot-ttm-65"],
      [
        { questionId: "pilot-ttm-63", response: "No", score: null },
        { questionId: "pilot-ttm-65", response: "No", score: null },
      ],
    ).map(({ response }) => response)).toEqual([
      "No",
      "Not asked (conditional)",
      "No",
    ]);
    expect(getReviewerQuestionAnswers(
      ["pilot-ttm-63", "pilot-ttm-64", "pilot-ttm-65", "pilot-ttm-66"],
      [
        { questionId: "pilot-ttm-63", response: "Yes", score: null },
        { questionId: "pilot-ttm-64", response: "Yes", score: null },
      ],
    ).map(({ response }) => response)).toEqual([
      "Yes",
      "Yes",
      "Not asked (conditional)",
      "Not asked (conditional)",
    ]);
  });

  it("groups question details by TPB construct and omits Section 10", () => {
    const questionAnswers = [
      { questionId: "a1", questionNumber: 1, section: "Section 1: Behavioral Beliefs", prompt: null, response: "a", score: null },
      { questionId: "a3", questionNumber: 13, section: "Section 3: Attitude Toward the Behavior", prompt: null, response: "b", score: null },
      { questionId: "sn", questionNumber: 14, section: "Section 4: Normative Beliefs", prompt: null, response: "c", score: null },
      { questionId: "pbc", questionNumber: 24, section: "Section 7: Control Beliefs", prompt: null, response: "d", score: null },
      { questionId: "intention", questionNumber: 57, section: "Section 10: Behavioral Intention", prompt: null, response: "e", score: null },
    ];

    const groups = groupReviewerQuestionAnswers(questionAnswers);

    expect(groups.map(({ label, sectionsLabel, answers }) => ({
      label,
      sectionsLabel,
      questionIds: answers.map(({ questionId }) => questionId),
    }))).toEqual([
      { label: "Attitude", sectionsLabel: "Sections 1–3", questionIds: ["a1", "a3"] },
      { label: "Subjective norms", sectionsLabel: "Sections 4–6", questionIds: ["sn"] },
      { label: "Perceived behavioral control (PBC)", sectionsLabel: "Sections 7–9", questionIds: ["pbc"] },
    ]);
  });
});
