import { useId, useState, type FormEvent } from "react";
import { BookOpen, CookingPot, ExternalLink, LoaderCircle, ListChecks, ListOrdered, Plus, Search, Sparkles } from "lucide-react";
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "../../components/ui/primitives";
import { apiRequest } from "../../lib/api";
import { getReviewerRecipeSourceUrl, type ReviewerRecipe } from "./reviewer-recipes";

interface RecipeSearchResponse {
  recipes: ReviewerRecipe[];
  hasMore: boolean;
}

interface RecipeSearchError {
  error?: string;
}

export default function ReviewerRecipePicker({
  sampleMode = false,
  onSelect,
}: {
  sampleMode?: boolean;
  onSelect: (recipe: ReviewerRecipe) => boolean | void;
}) {
  const searchId = useId();
  const excludeId = useId();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [excludeIngredients, setExcludeIngredients] = useState("");
  const [recipes, setRecipes] = useState<ReviewerRecipe[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedTitle, setSelectedTitle] = useState("");

  async function searchRecipes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setError("Enter at least two characters to search by recipe or ingredient.");
      setRecipes([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setError("");
    const params = new URLSearchParams({ q: normalizedQuery });
    if (source) params.set("source", source);
    if (excludeIngredients.trim()) params.set("exclude", excludeIngredients.trim());
    if (sampleMode) params.set("sample", "true");
    const endpoint = `/api/reviewer/recipes?${params.toString()}`;
    try {
      if (sampleMode) {
        const response = await fetch(endpoint);
        const payload = await response.json() as RecipeSearchResponse & RecipeSearchError;
        if (!response.ok) throw new Error(payload.error ?? `Recipe search failed (${response.status}).`);
        setRecipes(payload.recipes);
        setHasMore(payload.hasMore);
      } else {
        const result = await apiRequest<RecipeSearchResponse>(endpoint);
        setRecipes(result.recipes);
        setHasMore(result.hasMore);
      }
      setSearched(true);
    } catch (searchError) {
      setRecipes([]);
      setHasMore(false);
      setSearched(false);
      setError(searchError instanceof Error ? searchError.message : "Could not search RecipeNLG.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
      <div className="reviewer-recipe-launcher">
        <div className="reviewer-recipe-launcher-copy">
          <span className="reviewer-recipe-launcher-icon"><BookOpen size={16} /></span>
          <span>
            <strong>{selectedTitle ? "Change selected recipe" : "Add a recipe"}</strong>
            <small>{selectedTitle || "Browse the RecipeNLG collection and add your pick to the recommendation."}</small>
          </span>
        </div>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Search size={14} /> Browse recipes
          </Button>
        </DialogTrigger>
      </div>
      {selectedTitle && (
        <p className="reviewer-recipe-picker-selected" role="status">
          <Badge className="reviewer-recipe-type-badge"><CookingPot size={10} /> Selected</Badge>
          Dish chosen: {selectedTitle}. Select Preview to see the full recipe in the participant message before sending.
        </p>
      )}
      {drawerOpen && (
        <DialogContent className="reviewer-recipe-drawer" overlayClassName="reviewer-recipe-drawer-overlay">
            <header className="reviewer-recipe-drawer-header">
              <span className="eyebrow"><BookOpen size={13} /> RECIPE LIBRARY</span>
              <DialogTitle>Choose a recipe</DialogTitle>
              <DialogDescription>Search the collection, check the ingredients and instructions, then add your choice to the recommendation.</DialogDescription>
            </header>
            <div className="reviewer-recipe-drawer-scroll">
              <form className="reviewer-recipe-picker-form" onSubmit={(event) => void searchRecipes(event)} aria-busy={loading}>
                <div className="reviewer-recipe-picker-search">
                  <label className="sr-only" htmlFor={searchId}>Search recipes by name or ingredient</label>
                  <Search size={15} aria-hidden="true" />
                  <input
                    id={searchId}
                    type="search"
                    minLength={2}
                    maxLength={80}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search recipe or ingredient"
                  />
                </div>
                <Button type="submit" disabled={loading}>
                  {loading ? <LoaderCircle size={14} className="auth-spinner" /> : <Search size={14} />}
                  Search
                </Button>
                <div className="reviewer-recipe-picker-filters">
                  <label>
                    <span>Collection</span>
                    <select value={source} onChange={(event) => setSource(event.target.value)}>
                      <option value="">All collections</option>
                      <option value="Gathered">Gathered</option>
                      <option value="Recipes1M">Recipes1M</option>
                    </select>
                  </label>
                  <label htmlFor={excludeId}>
                    <span>Exclude ingredients</span>
                    <input
                      id={excludeId}
                      type="text"
                      maxLength={160}
                      value={excludeIngredients}
                      onChange={(event) => setExcludeIngredients(event.target.value)}
                      placeholder="e.g. peanuts, shellfish"
                    />
                  </label>
                </div>
              </form>
              {error && <p className="reviewer-recipe-picker-error" role="alert">{error}</p>}
              {searched && recipes.length === 0 && !error && (
                <p className="reviewer-recipe-picker-empty" role="status">No recipes matched. Try another dish or ingredient.</p>
              )}
              {recipes.length > 0 && (
                <>
                  <div className="reviewer-recipe-picker-results-heading">
                    <strong>Recipe matches</strong>
                    <span>{recipes.length}{hasMore ? "+" : ""} results · scroll to browse</span>
                  </div>
                  <div
                    className="reviewer-recipe-picker-results"
                    role="region"
                    aria-label={`Recipe results for ${query}`}
                    tabIndex={0}
                  >
                    {recipes.map((recipe) => {
                      const sourceUrl = getReviewerRecipeSourceUrl(recipe.link);
                      return (
                        <article className="reviewer-recipe-picker-result" key={recipe.id}>
                          <div className="reviewer-recipe-picker-result-heading">
                            <div className="reviewer-recipe-picker-title">
                              <span className="reviewer-recipe-dish-icon"><CookingPot size={15} /></span>
                              <strong>{recipe.title}</strong>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (onSelect(recipe) === false) return;
                                setSelectedTitle(recipe.title);
                                setDrawerOpen(false);
                              }}
                            >
                              <Plus size={13} /> Add recipe
                            </Button>
                          </div>
                          <div className="reviewer-recipe-picker-badges" aria-label="Recipe details">
                            <Badge className="reviewer-recipe-type-badge"><CookingPot size={10} /> Recipe</Badge>
                            {recipe.source && <Badge className="reviewer-recipe-source-badge">{recipe.source}</Badge>}
                            <Badge className="reviewer-recipe-detail-badge"><ListChecks size={10} /> {recipe.ingredients.length} ingredients</Badge>
                            <Badge className="reviewer-recipe-detail-badge"><ListOrdered size={10} /> {recipe.directions.length} steps</Badge>
                          </div>
                          <details>
                            <summary><ListOrdered size={12} /> View ingredients and directions</summary>
                            <div className="reviewer-recipe-picker-details">
                              <div>
                                <strong>Ingredients</strong>
                                {recipe.ingredients.length > 0
                                  ? <ul>{recipe.ingredients.map((ingredient, index) => <li key={`${recipe.id}-ingredient-${index}`}>{ingredient}</li>)}</ul>
                                  : <p>No ingredient list is available.</p>}
                              </div>
                              <div>
                                <strong>Directions</strong>
                                {recipe.directions.length > 0
                                  ? <ol>{recipe.directions.map((direction, index) => <li key={`${recipe.id}-direction-${index}`}>{direction}</li>)}</ol>
                                  : <p>No directions are available.</p>}
                              </div>
                              {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open source recipe</a>}
                            </div>
                          </details>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
              <p className="reviewer-recipe-picker-note">
                <Sparkles size={12} /> RecipeNLG is for non-commercial research and education. Review ingredients and food safety yourself; recipes are not nutrition or allergen-validated.
              </p>
            </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
