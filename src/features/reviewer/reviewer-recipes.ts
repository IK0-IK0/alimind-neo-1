export interface ReviewerRecipe {
  id: number;
  title: string;
  ingredients: string[];
  directions: string[];
  link: string;
  source: string;
}

const MAX_RECOMMENDATION_LENGTH = 5000;
const MAX_RESPONSE_LENGTH = 5000;

export function getReviewerRecipeSourceUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = trimmed.startsWith("//")
    ? `https:${trimmed}`
    : /^[a-z][a-z\d+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function formatRecipeRecommendation(recipe: ReviewerRecipe): string {
  const title = `Recipe: ${recipe.title}`;
  const ingredients = `Ingredients: ${recipe.ingredients.join(", ") || "Check the recipe details."}`;
  const sourceUrl = getReviewerRecipeSourceUrl(recipe.link);
  const source = sourceUrl ? `\nSource: ${sourceUrl}` : "";
  const prefix = `${title}\n${ingredients}\nDirections: `;
  const fullDirections = recipe.directions.map((step, index) => `${index + 1}. ${step}`).join("\n");
  const directionBudget = Math.max(0, MAX_RECOMMENDATION_LENGTH - prefix.length - source.length);
  const directions = fullDirections.length > directionBudget
    ? `${fullDirections.slice(0, Math.max(0, directionBudget - 3)).trimEnd()}...`
    : fullDirections;
  return `${prefix}${directions}${source}`.slice(0, MAX_RECOMMENDATION_LENGTH);
}

export function appendRecipeToResponse(response: string, recipe: ReviewerRecipe): string {
  const existingResponse = response.trimEnd();
  const recipeText = formatRecipeRecommendation(recipe);
  const nextResponse = existingResponse
    ? `${existingResponse}\n\n${recipeText}`
    : recipeText;

  if (nextResponse.length > MAX_RESPONSE_LENGTH) {
    throw new RangeError(
      "The participant response and selected recipe exceed the 5,000-character limit. Shorten the response before adding this dish.",
    );
  }

  return nextResponse;
}
