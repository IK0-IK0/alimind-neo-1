export type RecipeDiet =
  | "none"
  | "vegetarian"
  | "vegan"
  | "pescetarian"
  | "gluten free"
  | "dairy free"
  | "ketogenic";

export type RecipeEffort = "easy" | "moderate" | "advanced" | "unknown";

export interface RecipeCriteria {
  query: string;
  pantryIngredients: string[];
  avoidIngredients: string[];
  intolerances: string[];
  diet: RecipeDiet;
  maxReadyTime: number;
  servings: number;
  maxCostPerServingPhp: number | null;
  maxEffort: "any" | Exclude<RecipeEffort, "unknown">;
}

export interface RecipeExchangeRate {
  usdToPhp: number;
  date: string;
  source: "Frankfurter" | "fallback";
}

export interface GeneratedRecipe {
  id: number;
  title: string;
  image: string | null;
  sourceUrl: string | null;
  readyInMinutes: number | null;
  servings: number | null;
  estimatedCostPerServingUsd: number | null;
  estimatedTotalCostUsd: number | null;
  estimatedCostPerServingPhp: number | null;
  estimatedTotalCostPhp: number | null;
  pantryMatchedIngredients: string[];
  missingIngredients: string[];
  ingredients: string[];
  equipment: string[];
  instructions: string[];
  effort: RecipeEffort;
}

export interface RecipeGenerationResponse {
  recipes: GeneratedRecipe[];
  candidateCount: number;
  exchangeRate: RecipeExchangeRate;
  provider: "spoonacular";
  note: string;
}
