import { useState, type FormEvent } from "react";
import { CookingPot, LoaderCircle, Search } from "lucide-react";
import { Badge, Button } from "../../components/ui/primitives";
import { apiRequest } from "../../lib/api";
import { pickRandomRecipe } from "./random";
import { RecipeCard } from "./RecipeCard";
import type {
  GeneratedRecipe,
  RecipeDiet,
  RecipeEffort,
  RecipeGenerationResponse,
} from "./types";

type RecipeForm = {
  query: string;
  pantryIngredients: string;
  avoidIngredients: string;
  intolerances: string;
  diet: RecipeDiet;
  maxReadyTime: string;
  servings: string;
  maxCostPerServingPhp: string;
  maxEffort: "any" | Exclude<RecipeEffort, "unknown">;
};

export type RecipeSearchState = {
  status: "loading" | "passed" | "blocked";
  output: string;
  recipe: GeneratedRecipe | null;
  candidateCount: number;
};

type RecipeFinderProps = {
  variant?: "panel" | "chat";
  id?: string;
  onSearchState?: (state: RecipeSearchState) => void;
};

const EMPTY_RECIPE_FORM: RecipeForm = {
  query: "",
  pantryIngredients: "",
  avoidIngredients: "",
  intolerances: "",
  diet: "none",
  maxReadyTime: "60",
  servings: "2",
  maxCostPerServingPhp: "",
  maxEffort: "any",
};

function splitCriteria(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseCost(value: string) {
  return value ? Number(value) : null;
}

export function RecipeFinder({ variant = "panel", id, onSearchState }: RecipeFinderProps) {
  const [form, setForm] = useState<RecipeForm>(EMPTY_RECIPE_FORM);
  const [lastSubmittedForm, setLastSubmittedForm] = useState<RecipeForm | null>(null);
  const [response, setResponse] = useState<RecipeGenerationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const hasPendingChanges = lastSubmittedForm
    ? JSON.stringify(form) !== JSON.stringify(lastSubmittedForm)
    : JSON.stringify(form) !== JSON.stringify(EMPTY_RECIPE_FORM);

  function updateForm(field: keyof RecipeForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");
    setLastSubmittedForm({ ...form });
    onSearchState?.({
      status: "loading",
      output: "Searching for recipes that fit these filters…",
      recipe: null,
      candidateCount: 0,
    });

    try {
      const nextResponse = await apiRequest<RecipeGenerationResponse>("/api/recipes/generate", {
        method: "POST",
        body: JSON.stringify({
          criteria: {
            query: form.query,
            pantryIngredients: splitCriteria(form.pantryIngredients),
            avoidIngredients: splitCriteria(form.avoidIngredients),
            intolerances: splitCriteria(form.intolerances),
            diet: form.diet,
            maxReadyTime: Number(form.maxReadyTime),
            servings: Number(form.servings),
            maxCostPerServingPhp: parseCost(form.maxCostPerServingPhp),
            maxEffort: form.maxEffort,
          },
        }),
      });
      const recipe = pickRandomRecipe(nextResponse.recipes);
      setResponse({
        ...nextResponse,
        recipes: recipe ? [recipe] : [],
      });

      if (!recipe) {
        onSearchState?.({
          status: "blocked",
          output: "No recipes matched these filters. Try changing a filter and search again.",
          recipe: null,
          candidateCount: nextResponse.candidateCount,
        });
        return;
      }

      onSearchState?.({
        status: "passed",
        output: `Randomly picked one dish from ${nextResponse.candidateCount} matching ${nextResponse.candidateCount === 1 ? "candidate" : "candidates"}.`,
        recipe,
        candidateCount: nextResponse.candidateCount,
      });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Recipe search failed. Please try again.";
      setError(message);
      onSearchState?.({
        status: "blocked",
        output: message,
        recipe: null,
        candidateCount: 0,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id={id} className={`recipe-finder recipe-finder-${variant}`} aria-label="Recipe finder">
      {variant === "chat" && (
        <div className="recipe-finder-heading">
          <span className="recipe-finder-icon"><CookingPot size={16} /></span>
          <div><h2>Find a dish</h2><p>Choose your filters, then search to see a recipe here.</p></div>
        </div>
      )}
      {variant === "panel" && (
        <p className="recipe-generator-note">
          Change any filters below, then select “Search again” to refresh the dish. Press Enter in a filter to search, too.
        </p>
      )}
      <form className="recipe-finder-form" onSubmit={(event) => void submit(event)} aria-busy={loading}>
        <fieldset className="recipe-generator-fields" disabled={loading}>
          <label>Recipe or ingredient to search
            <input value={form.query} onChange={(event) => updateForm("query", event.target.value)} maxLength={100} placeholder="e.g. monggo, chicken adobo" />
          </label>
          <label>Ingredients you have
            <input value={form.pantryIngredients} onChange={(event) => updateForm("pantryIngredients", event.target.value)} placeholder="e.g. mung beans, spinach, garlic" />
          </label>
          <label>Ingredients to avoid
            <input value={form.avoidIngredients} onChange={(event) => updateForm("avoidIngredients", event.target.value)} placeholder="Comma-separated" />
          </label>
          <label>Allergens / intolerances
            <input value={form.intolerances} onChange={(event) => updateForm("intolerances", event.target.value)} placeholder="e.g. peanut, dairy, gluten" />
          </label>
          <label>Diet
            <select value={form.diet} onChange={(event) => updateForm("diet", event.target.value as RecipeDiet)}>
              <option value="none">No specific diet</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="vegan">Vegan</option>
              <option value="pescetarian">Pescetarian</option>
              <option value="gluten free">Gluten-free</option>
              <option value="dairy free">Dairy-free</option>
              <option value="ketogenic">Ketogenic</option>
            </select>
          </label>
          <label>Max cooking time (minutes)
            <input type="number" min="5" max="240" value={form.maxReadyTime} onChange={(event) => updateForm("maxReadyTime", event.target.value)} />
          </label>
          <label>Minimum recipe servings
            <input type="number" min="1" max="12" value={form.servings} onChange={(event) => updateForm("servings", event.target.value)} />
          </label>
          <label>Max estimated cost / serving (PHP)
            <input type="number" min="30" max="10000" step="50" value={form.maxCostPerServingPhp} onChange={(event) => updateForm("maxCostPerServingPhp", event.target.value)} placeholder="Optional" />
          </label>
          <label>Effort filter
            <select value={form.maxEffort} onChange={(event) => updateForm("maxEffort", event.target.value as RecipeForm["maxEffort"])}>
              <option value="any">Any effort</option>
              <option value="easy">Easy only</option>
              <option value="moderate">Moderate only</option>
              <option value="advanced">Advanced only</option>
            </select>
          </label>
        </fieldset>
        <div className="recipe-finder-actions">
          <Button className="recipe-finder-submit" type="submit" disabled={loading}>
            {loading ? <LoaderCircle className="pipeline-spinner" size={15} aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
            {loading ? "Searching…" : response ? "Search again" : "Find a recipe"}
          </Button>
          {hasPendingChanges && response && (
            <span className="recipe-filter-status">Filters changed. Search again to update this dish.</span>
          )}
        </div>
        {loading && (
          <p className="recipe-loading" role="status" aria-live="polite">
            <LoaderCircle className="pipeline-spinner" size={15} aria-hidden="true" />
            Finding a recipe that fits…
          </p>
        )}
        {error && <p className="recipe-search-error" role="alert">{error}</p>}
      </form>
      <p className="recipe-generator-disclaimer">
        Ingredient costs are Spoonacular estimates converted from USD using the daily USD/PHP exchange rate, not observed Philippine market prices. Effort is a rough heuristic; pantry matches do not confirm local availability. Allergy filters are not a safety guarantee—check each source recipe’s ingredients.
      </p>
      {response && (
        response.recipes.length > 0 ? (
          <div className="recipe-results" aria-live="polite">
            <RecipeCard
              recipe={response.recipes[0]!}
              candidateCount={response.candidateCount}
              exchangeRate={response.exchangeRate}
              variant={variant}
            />
            <p className="recipe-generator-disclaimer">{response.note}</p>
          </div>
        ) : (
          <p className="recipe-search-empty" role="status">No recipes matched these filters. Change a filter and search again.</p>
        )
      )}
    </section>
  );
}
