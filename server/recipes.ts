import type {
  GeneratedRecipe,
  RecipeCriteria,
  RecipeDiet,
  RecipeEffort,
} from "../src/features/recipes/types.js";
import { convertUsdToPhp } from "../src/features/recipes/currency.js";

const SPOONACULAR_SEARCH_URL = "https://api.spoonacular.com/recipes/complexSearch";
const MAX_RESULTS = 8;

const DIETS = new Set<RecipeDiet>([
  "none",
  "vegetarian",
  "vegan",
  "pescetarian",
  "gluten free",
  "dairy free",
  "ketogenic",
]);

const INTOLERANCES = new Set([
  "dairy",
  "egg",
  "gluten",
  "grain",
  "peanut",
  "seafood",
  "sesame",
  "shellfish",
  "soy",
  "sulfite",
  "tree nut",
  "wheat",
]);

export class RecipeRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipeRequestError";
  }
}

export class RecipeProviderError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "RecipeProviderError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIngredientList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 12) {
    throw new RecipeRequestError(`${field} must contain no more than 12 ingredients.`);
  }
  const items = value.map((item) => {
    if (typeof item !== "string" || !item.trim() || item.trim().length > 60) {
      throw new RecipeRequestError(`${field} contains an invalid ingredient.`);
    }
    return item.trim();
  });
  return [...new Set(items.map((item) => item.toLocaleLowerCase()))];
}

export function validateRecipeCriteria(value: unknown): RecipeCriteria {
  if (!isRecord(value)) throw new RecipeRequestError("Recipe criteria are required.");

  const query = value.query ?? "";
  if (typeof query !== "string" || query.trim().length > 100) {
    throw new RecipeRequestError("The recipe search must be 100 characters or fewer.");
  }

  const diet = value.diet ?? "none";
  if (typeof diet !== "string" || !DIETS.has(diet as RecipeDiet)) {
    throw new RecipeRequestError("Choose a supported dietary preference.");
  }

  const intolerances = parseIngredientList(value.intolerances ?? [], "Allergens");
  if (intolerances.some((item) => !INTOLERANCES.has(item.toLocaleLowerCase()))) {
    throw new RecipeRequestError("One or more selected allergens are not supported.");
  }

  const maxReadyTime = value.maxReadyTime === undefined ? 60 : value.maxReadyTime;
  if (typeof maxReadyTime !== "number" || !Number.isInteger(maxReadyTime) || maxReadyTime < 5 || maxReadyTime > 240) {
    throw new RecipeRequestError("Maximum cooking time must be between 5 and 240 minutes.");
  }

  const servings = value.servings === undefined ? 2 : value.servings;
  if (typeof servings !== "number" || !Number.isInteger(servings) || servings < 1 || servings > 12) {
    throw new RecipeRequestError("Servings must be between 1 and 12.");
  }

  const cost: unknown = value.maxCostPerServingPhp ?? null;
  if (cost !== null && (typeof cost !== "number" || !Number.isFinite(cost) || cost < 30 || cost > 10_000)) {
    throw new RecipeRequestError("Maximum cost must be between ₱30 and ₱10,000 per serving.");
  }

  const maxEffort = value.maxEffort ?? "any";
  if (!["any", "easy", "moderate", "advanced"].includes(String(maxEffort))) {
    throw new RecipeRequestError("Choose a supported effort level.");
  }

  return {
    query: query.trim(),
    pantryIngredients: parseIngredientList(value.pantryIngredients ?? [], "Available ingredients"),
    avoidIngredients: parseIngredientList(value.avoidIngredients ?? [], "Ingredients to avoid"),
    intolerances,
    diet: diet as RecipeDiet,
    maxReadyTime,
    servings,
    maxCostPerServingPhp: typeof cost === "number" ? cost : null,
    maxEffort: maxEffort as RecipeCriteria["maxEffort"],
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function httpsUrl(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function ingredientName(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return stringValue(value.original) ?? stringValue(value.name);
}

function normalizedName(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function effortFor(minutes: number | null, instructionCount: number): RecipeEffort {
  if (minutes === null || instructionCount === 0) return "unknown";
  if (minutes <= 35 && instructionCount <= 6) return "easy";
  if (minutes >= 75 || instructionCount >= 12) return "advanced";
  return "moderate";
}

function readInstructions(recipe: Record<string, unknown>): string[] {
  const analyzed = Array.isArray(recipe.analyzedInstructions) ? recipe.analyzedInstructions : [];
  const steps = analyzed.flatMap((group) => {
    if (!isRecord(group) || !Array.isArray(group.steps)) return [];
    return group.steps.flatMap((step) => {
      if (!isRecord(step)) return [];
      const text = stringValue(step.step);
      return text ? [text] : [];
    });
  });
  if (steps.length) return steps;
  const fallback = stringValue(recipe.instructions)?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return fallback ? [fallback] : [];
}

function readEquipment(recipe: Record<string, unknown>): string[] {
  const analyzed = Array.isArray(recipe.analyzedInstructions) ? recipe.analyzedInstructions : [];
  const equipment = analyzed.flatMap((group) => {
    if (!isRecord(group) || !Array.isArray(group.steps)) return [];
    return group.steps.flatMap((step) => {
      if (!isRecord(step) || !Array.isArray(step.equipment)) return [];
      return step.equipment.flatMap((item) => {
        if (!isRecord(item)) return [];
        const name = stringValue(item.name);
        return name ? [name] : [];
      });
    });
  });
  return [...new Set(equipment)];
}

function mapRecipe(value: unknown, usdToPhp: number): GeneratedRecipe | null {
  if (!isRecord(value) || typeof value.id !== "number" || typeof value.title !== "string") return null;
  const used = Array.isArray(value.usedIngredients) ? value.usedIngredients : [];
  const missed = Array.isArray(value.missedIngredients) ? value.missedIngredients : [];
  const ingredients = Array.isArray(value.extendedIngredients)
    ? value.extendedIngredients.map(ingredientName).filter((item): item is string => item !== null)
    : [...used, ...missed].map(ingredientName).filter((item): item is string => item !== null);
  const time = numberValue(value.readyInMinutes);
  const servings = numberValue(value.servings);
  const instructions = readInstructions(value);
  const costCents = numberValue(value.pricePerServing);
  const costPerServing = costCents === null ? null : costCents / 100;

  return {
    id: value.id,
    title: value.title,
    image: httpsUrl(value.image),
    sourceUrl: httpsUrl(value.spoonacularSourceUrl) ?? httpsUrl(value.sourceUrl),
    readyInMinutes: time,
    servings,
    estimatedCostPerServingUsd: costPerServing,
    estimatedTotalCostUsd: costPerServing === null || servings === null
      ? null
      : costPerServing * servings,
    estimatedCostPerServingPhp: costPerServing === null
      ? null
      : convertUsdToPhp(costPerServing, usdToPhp),
    estimatedTotalCostPhp: costPerServing === null || servings === null
      ? null
      : convertUsdToPhp(costPerServing * servings, usdToPhp),
    pantryMatchedIngredients: used.map(ingredientName).filter((item): item is string => item !== null),
    missingIngredients: missed.map(ingredientName).filter((item): item is string => item !== null),
    ingredients,
    equipment: readEquipment(value),
    instructions,
    effort: effortFor(time, instructions.length),
  };
}

function rankRecipe(recipe: GeneratedRecipe, pantryIngredients: string[]): number {
  const pantryTerms = pantryIngredients.map(normalizedName);
  const matchingCount = new Set([
    ...recipe.pantryMatchedIngredients,
    ...recipe.ingredients.filter((ingredient) =>
      pantryTerms.some((term) => normalizedName(ingredient).includes(term)),
    ),
  ].map(normalizedName)).size;
  const timePenalty = recipe.readyInMinutes ?? 240;
  return matchingCount * 10 - recipe.missingIngredients.length * 3 - timePenalty / 60;
}

export async function generateRecipes(
  criteria: RecipeCriteria,
  apiKey = process.env.SPOONACULAR_API_KEY,
  fetcher: typeof fetch = fetch,
  usdToPhp = Number(process.env.USD_TO_PHP_FALLBACK_RATE ?? 63.251),
): Promise<GeneratedRecipe[]> {
  if (!Number.isFinite(usdToPhp) || usdToPhp <= 0) {
    throw new RecipeProviderError("The configured USD/PHP exchange rate is invalid.", 503);
  }
  if (!apiKey?.trim()) {
    throw new RecipeProviderError("Recipe search is not configured. Add SPOONACULAR_API_KEY to the server environment.", 503);
  }

  const url = new URL(SPOONACULAR_SEARCH_URL);
  url.searchParams.set("apiKey", apiKey.trim());
  url.searchParams.set("addRecipeInformation", "true");
  url.searchParams.set("addRecipeInstructions", "true");
  url.searchParams.set("fillIngredients", "true");
  url.searchParams.set("number", String(MAX_RESULTS));
  if (criteria.query) url.searchParams.set("query", criteria.query);
  if (criteria.diet !== "none") url.searchParams.set("diet", criteria.diet);
  if (criteria.pantryIngredients.length) {
    url.searchParams.set("includeIngredients", criteria.pantryIngredients.join(","));
  }
  if (criteria.avoidIngredients.length) {
    url.searchParams.set("excludeIngredients", criteria.avoidIngredients.join(","));
  }
  if (criteria.intolerances.length) url.searchParams.set("intolerances", criteria.intolerances.join(","));

  let response: Response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new RecipeProviderError("Could not reach Spoonacular. Check the server connection and try again.", 502);
  }
  if (!response.ok) {
    throw new RecipeProviderError(`Spoonacular could not complete the search (HTTP ${response.status}). Check the API key, quota, and plan.`, 502);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RecipeProviderError("Spoonacular returned an unreadable response.", 502);
  }
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new RecipeProviderError("Spoonacular returned an unexpected recipe response.", 502);
  }

  return payload.results
    .map((recipe) => mapRecipe(recipe, usdToPhp))
    .filter((recipe): recipe is GeneratedRecipe => recipe !== null)
    .filter((recipe) => recipe.instructions.length > 0)
    .filter((recipe) => recipe.readyInMinutes !== null && recipe.readyInMinutes <= criteria.maxReadyTime)
    .filter((recipe) => recipe.servings !== null && recipe.servings >= criteria.servings)
    .filter((recipe) => criteria.maxEffort === "any" || recipe.effort === criteria.maxEffort)
    .filter((recipe) => criteria.maxCostPerServingPhp === null
      || recipe.estimatedCostPerServingPhp !== null
      && recipe.estimatedCostPerServingPhp <= criteria.maxCostPerServingPhp)
    .sort((left, right) =>
      rankRecipe(right, criteria.pantryIngredients) - rankRecipe(left, criteria.pantryIngredients)
      || (left.readyInMinutes ?? 240) - (right.readyInMinutes ?? 240),
    )
    .slice(0, MAX_RESULTS);
}
