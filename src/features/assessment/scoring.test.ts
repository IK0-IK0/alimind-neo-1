import { describe, expect, it } from "vitest";
import { QUESTIONS } from "../../data/questionnaire";
import { calculateProfile, makeAnswer, scoreResponse, shuffleQuestions } from "./scoring";

describe("assessment scoring", () => {
  it("defines 62 unique questions across the three TPB constructs and intention", () => {
    expect(QUESTIONS).toHaveLength(62);
    expect(new Set(QUESTIONS.map((question) => question.id)).size).toBe(62);
    expect(QUESTIONS.filter((question) => question.construct !== "intention")).toHaveLength(57);
    expect(QUESTIONS.filter((question) => question.construct === "intention")).toHaveLength(5);
  });

  it("uses whole phrase matches rather than substring matches", () => {
    const item = QUESTIONS.find((question) => question.id === "att-21")!;
    expect(scoreResponse(item, "healthy eating is not important to me")).toBe(0);
    expect(scoreResponse(item, "That is an importantance to consider")).toBeNull();
  });

  it("keeps skipped and unmatched responses missing instead of neutral", () => {
    const item = QUESTIONS[0];
    expect(makeAnswer(item, "skip").score).toBeNull();
    expect(makeAnswer(item, "I have no idea at all").score).toBeNull();
    expect(calculateProfile(QUESTIONS, []).scores.attitude).toBeUndefined();
  });

  it("requires three scoreable answers before showing a construct estimate", () => {
    const attitude = QUESTIONS.filter((item) => item.construct === "attitude");
    const twoAnswers = attitude.slice(0, 2).map((item) => makeAnswer(item, item.keywords[100][0]));
    const threeAnswers = attitude.slice(0, 3).map((item) => makeAnswer(item, item.keywords[100][0]));
    expect(calculateProfile(QUESTIONS, twoAnswers).scores.attitude).toBeUndefined();
    expect(calculateProfile(QUESTIONS, threeAnswers).scores.attitude).toBe(100);
  });

  it("uses experimental 1–7 TPB ratings on the existing profile scale", () => {
    const attitude = QUESTIONS.filter((item) => item.construct === "attitude").slice(0, 3);
    const answers = attitude.map((item) => ({
      questionId: item.id,
      response: "A response",
      score: null,
      tpbModelRating: 4,
    }));

    expect(calculateProfile(QUESTIONS, answers).scores.attitude).toBe(50);
  });

  it("rejects out-of-range TPB model ratings", () => {
    const question = QUESTIONS.find((item) => item.construct === "attitude")!;

    expect(() => calculateProfile(QUESTIONS, [{
      questionId: question.id,
      response: "A response",
      score: null,
      tpbModelRating: 8,
    }])).toThrow("A TPB model rating must be between 1 and 7.");
  });

  it("preserves valid zero scores and maps all-low responses to pre-contemplation", () => {
    const answers = QUESTIONS.map((item) => makeAnswer(item, item.keywords[0][0]));
    const profile = calculateProfile(QUESTIONS, answers);
    expect(profile.scores.attitude).toBe(0);
    expect(profile.scores.subjectiveNorm).toBe(0);
    expect(profile.scores.perceivedControl).toBe(0);
    expect(profile.readiness).toBe(0);
    expect(profile.stage).toBe("Pre-contemplation");
    expect(profile.weakest).toBe("attitude");
  });

  it("maps all-high readiness answers to maintenance", () => {
    const intention = QUESTIONS.filter((item) => item.construct === "intention");
    const profile = calculateProfile(QUESTIONS, intention.map((item) => makeAnswer(item, item.keywords[100][0])));
    expect(profile.stage).toBe("Maintenance");
  });

  it("shuffles a copy without changing the source", () => {
    const source = [1, 2, 3, 4];
    const shuffled = shuffleQuestions(source, () => 0);
    expect(source).toEqual([1, 2, 3, 4]);
    expect(shuffled).toHaveLength(source.length);
    expect(shuffled.sort()).toEqual(source);
  });
});
