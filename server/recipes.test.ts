import { describe, expect, it, vi } from "vitest";
import {
  generateRecipes,
  RecipeProviderError,
  RecipeRequestError,
  validateRecipeCriteria,
} from "./recipes";
import { pickRandomRecipe } from "../src/features/recipes/random";

const defaultCriteria = () => validateRecipeCriteria({});

describe("Spoonacular recipe generation", () => {
  it("sends provider-supported search filters and maps returned recipe details", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify({
        results: [
          {
            id: 101,
            title: "Vegetable stew",
            image: "https://images.example.test/dish.jpg",
            spoonacularSourceUrl: "https://spoonacular.com/recipes/vegetable-stew-101",
            readyInMinutes: 30,
            servings: 3,
            pricePerServing: 275,
            usedIngredients: [{ original: "garlic" }],
            missedIngredients: [{ original: "eggplant" }],
            extendedIngredients: [{ original: "garlic" }, { original: "eggplant" }],
            analyzedInstructions: [{
              steps: [
                { step: "Saute the garlic.", equipment: [{ name: "frying pan" }] },
                { step: "Add the vegetables.", equipment: [{ name: "frying pan" }, { name: "pot" }] },
              ],
            }],
          },
        ],
      }), { status: 200 });
    });
    const criteria = validateRecipeCriteria({
      query: "vegetable stew",
      pantryIngredients: ["garlic", "onion"],
      avoidIngredients: ["pork"],
      intolerances: ["peanut"],
      diet: "vegetarian",
      maxReadyTime: 45,
      servings: 3,
      maxCostPerServingPhp: 300,
      maxEffort: "easy",
    });

    const recipes = await generateRecipes(criteria, "test-key", fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    const requestedUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.has("cuisine")).toBe(false);
    expect(requestedUrl.searchParams.get("query")).toBe("vegetable stew");
    expect(requestedUrl.searchParams.get("includeIngredients")).toBe("garlic,onion");
    expect(requestedUrl.searchParams.get("excludeIngredients")).toBe("pork");
    expect(requestedUrl.searchParams.get("intolerances")).toBe("peanut");
    expect(requestedUrl.searchParams.get("diet")).toBe("vegetarian");
    expect(requestedUrl.searchParams.has("maxReadyTime")).toBe(false);
    expect(requestedUrl.searchParams.has("minServings")).toBe(false);
    expect(requestedUrl.searchParams.has("maxPrice")).toBe(false);
    expect(requestedUrl.searchParams.get("addRecipeInformation")).toBe("true");
    expect(requestedUrl.searchParams.get("addRecipeInstructions")).toBe("true");
    expect(requestedUrl.searchParams.has("instructionsRequired")).toBe(false);
    expect(recipes).toEqual([
      expect.objectContaining({
        id: 101,
        title: "Vegetable stew",
        sourceUrl: "https://spoonacular.com/recipes/vegetable-stew-101",
        estimatedCostPerServingUsd: 2.75,
        estimatedTotalCostUsd: 8.25,
        estimatedCostPerServingPhp: 2.75 * 63.251,
        estimatedTotalCostPhp: 8.25 * 63.251,
        effort: "easy",
        equipment: ["frying pan", "pot"],
        pantryMatchedIngredients: ["garlic"],
        missingIngredients: ["eggplant"],
        instructions: ["Saute the garlic.", "Add the vegetables."],
      }),
    ]);
  });

  it("requires a server-side API key and avoids making a request without one", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(generateRecipes(defaultCriteria(), "", fetcher)).rejects.toThrow(
      "Add SPOONACULAR_API_KEY to the server environment.",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("validates constraints before calling the provider", () => {
    expect(() => validateRecipeCriteria({ maxReadyTime: 0 })).toThrow(RecipeRequestError);
    expect(() => validateRecipeCriteria({ intolerances: ["unknown allergen"] })).toThrow(RecipeRequestError);
    expect(() => validateRecipeCriteria({ pantryIngredients: Array(13).fill("rice") })).toThrow(RecipeRequestError);
  });

  it("reports provider failures without returning a successful empty result", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("quota exceeded", { status: 402 }));
    await expect(generateRecipes(defaultCriteria(), "test-key", fetcher)).rejects.toMatchObject({
      name: "RecipeProviderError",
      status: 502,
    } satisfies Partial<RecipeProviderError>);
  });

  it("applies time, serving, cost, and instruction requirements to returned candidates", async () => {
    const makeRecipe = (id: number, overrides: Record<string, unknown> = {}) => ({
      id,
      title: `Recipe ${id}`,
      readyInMinutes: 30,
      servings: 4,
      pricePerServing: 250,
      analyzedInstructions: [{ steps: [{ step: "Cook the ingredients." }] }],
      ...overrides,
    });
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      results: [
        makeRecipe(1),
        makeRecipe(2, { readyInMinutes: 60 }),
        makeRecipe(3, { servings: 1 }),
        makeRecipe(4, { pricePerServing: 500 }),
        makeRecipe(5, { analyzedInstructions: [] }),
      ],
    }), { status: 200 }));
    const criteria = validateRecipeCriteria({
      maxReadyTime: 45,
      servings: 2,
      maxCostPerServingPhp: 299,
      maxEffort: "any",
    });

    const recipes = await generateRecipes(criteria, "test-key", fetcher, 60);

    expect(recipes.map((recipe) => recipe.id)).toEqual([1]);
    expect(recipes[0]?.estimatedCostPerServingPhp).toBe(150);
  });

  it("applies the Philippine-peso serving budget to converted provider estimates", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      results: [{
        id: 8,
        title: "Budget recipe",
        readyInMinutes: 30,
        servings: 2,
        pricePerServing: 275,
        analyzedInstructions: [{ steps: [{ step: "Cook the ingredients." }] }],
      }],
    }), { status: 200 }));

    const underBudget = await generateRecipes(
      validateRecipeCriteria({ maxCostPerServingPhp: 170 }),
      "test-key",
      fetcher,
      60,
    );
    const overBudget = await generateRecipes(
      validateRecipeCriteria({ maxCostPerServingPhp: 160 }),
      "test-key",
      fetcher,
      60,
    );

    expect(underBudget.map((recipe) => recipe.id)).toEqual([8]);
    expect(overBudget).toEqual([]);
  });

  it("validates the maximum budget in Philippine pesos", () => {
    expect(() => validateRecipeCriteria({ maxCostPerServingPhp: 20 })).toThrow(
      "Maximum cost must be between ₱30 and ₱10,000 per serving.",
    );
  });

  it("randomly selects a candidate and handles an empty candidate list", () => {
    const recipes = [
      { id: 1, title: "First" },
      { id: 2, title: "Second" },
      { id: 3, title: "Third" },
    ] as Array<{ id: number; title: string }>;

    expect(pickRandomRecipe(recipes, () => 0)).toEqual(recipes[0]);
    expect(pickRandomRecipe(recipes, () => 0.75)).toEqual(recipes[2]);
    expect(pickRandomRecipe([], () => 0)).toBeNull();
  });
});
