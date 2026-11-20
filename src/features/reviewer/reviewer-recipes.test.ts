import { describe, expect, it } from "vitest";
import {
  appendRecipeToResponse,
  formatRecipeRecommendation,
  getReviewerRecipeSourceUrl,
  type ReviewerRecipe,
} from "./reviewer-recipes";

const recipe: ReviewerRecipe = {
  id: 12,
  title: "Chicken Adobo",
  ingredients: ["chicken", "soy sauce", "vinegar"],
  directions: ["Mix the sauce.", "Simmer the chicken."],
  link: "https://example.com/chicken-adobo",
  source: "Gathered",
};

describe("reviewer recipe recommendation formatting", () => {
  it("adds the selected recipe details and source to the recommendation text", () => {
    expect(formatRecipeRecommendation(recipe)).toBe(
      "Recipe: Chicken Adobo\nIngredients: chicken, soy sauce, vinegar\nDirections: 1. Mix the sauce.\n2. Simmer the chicken.\nSource: https://example.com/chicken-adobo",
    );
  });

  it("keeps long recipe recommendations within the live draft limit", () => {
    const longRecipe = {
      ...recipe,
      directions: ["a".repeat(6000)],
    };

    const formatted = formatRecipeRecommendation(longRecipe);
    expect(formatted).toHaveLength(5000);
    expect(formatted).toContain("...\nSource: https://example.com/chicken-adobo");
  });

  it("appends the recipe to the participant response without replacing its text", () => {
    expect(appendRecipeToResponse("A supportive reply.", recipe)).toBe(
      `A supportive reply.\n\n${formatRecipeRecommendation(recipe)}`,
    );
  });

  it("reports when the response and recipe exceed the participant response limit", () => {
    expect(() => appendRecipeToResponse("a".repeat(10), {
      ...recipe,
      directions: ["b".repeat(6000)],
    })).toThrow("exceed the 5,000-character limit");
  });

  it("normalizes source links and rejects non-web protocols", () => {
    expect(getReviewerRecipeSourceUrl("www.example.com/recipe")).toBe("https://www.example.com/recipe");
    expect(getReviewerRecipeSourceUrl("javascript:alert(1)")).toBeNull();
  });
});
