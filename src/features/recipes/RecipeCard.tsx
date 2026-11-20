import { Clock3, Dices, ExternalLink } from "lucide-react";
import { Badge } from "../../components/ui/primitives";
import { formatPhp } from "./currency";
import type { GeneratedRecipe, RecipeExchangeRate } from "./types";

type RecipeCardProps = {
  recipe: GeneratedRecipe;
  candidateCount: number;
  exchangeRate: RecipeExchangeRate;
  variant?: "panel" | "chat";
};

function formatExchangeRate(exchangeRate: RecipeExchangeRate) {
  const date = new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${exchangeRate.date}T00:00:00Z`));
  const rate = new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(exchangeRate.usdToPhp);
  return `₱${rate} per US$1 · ${exchangeRate.source} · ${date}`;
}

export function RecipeCard({
  recipe,
  candidateCount,
  exchangeRate,
  variant = "panel",
}: RecipeCardProps) {
  return (
    <article className={`recipe-result-card${variant === "chat" ? " recipe-chat-card" : ""}`}>
      {recipe.image && <img src={recipe.image} alt="" loading="lazy" />}
      <div className="recipe-result-main">
        <div className="recipe-title-row">
          <h3>{recipe.title}</h3>
          <Badge className="recipe-random-badge">
            <Dices size={12} /> Random pick · {candidateCount} {candidateCount === 1 ? "candidate" : "candidates"}
          </Badge>
        </div>
        <div className="recipe-result-facts">
          {recipe.readyInMinutes !== null && <span><Clock3 size={13} /> {recipe.readyInMinutes} min</span>}
          {recipe.servings !== null && <span>{recipe.servings} servings</span>}
          {recipe.estimatedCostPerServingPhp !== null && (
            <span>{formatPhp(recipe.estimatedCostPerServingPhp)} estimated / serving</span>
          )}
          {recipe.estimatedTotalCostPhp !== null && (
            <span>{formatPhp(recipe.estimatedTotalCostPhp)} estimated total</span>
          )}
          <span>{recipe.effort === "unknown" ? "Difficulty unknown" : `Difficulty: ${recipe.effort} · estimated`}</span>
        </div>
        <p className="recipe-exchange-note">
          Converted from Spoonacular’s USD estimate at {formatExchangeRate(exchangeRate)}. This is not a local market-price estimate.
        </p>
        <p><strong>Have:</strong> {recipe.pantryMatchedIngredients.length ? recipe.pantryMatchedIngredients.join(", ") : "No pantry matches returned"}</p>
        <p><strong>Still needed:</strong> {recipe.missingIngredients.length ? recipe.missingIngredients.join(", ") : "None reported"}</p>
        <p><strong>Equipment:</strong> {recipe.equipment.length ? recipe.equipment.join(", ") : "Not listed by the source"}</p>
        {recipe.ingredients.length > 0 && (
          <details>
            <summary>Ingredients</summary>
            <ul>{recipe.ingredients.map((ingredient, index) => <li key={`${recipe.id}-ingredient-${index}`}>{ingredient}</li>)}</ul>
          </details>
        )}
        {recipe.instructions.length > 0 && (
          <details open={variant === "panel"}>
            <summary>Cooking instructions · {recipe.instructions.length} steps</summary>
            <ol>{recipe.instructions.map((instruction, index) => <li key={`${recipe.id}-step-${index}`}>{instruction}</li>)}</ol>
          </details>
        )}
        {recipe.sourceUrl && (
          <a className="recipe-source-link" href={recipe.sourceUrl} target="_blank" rel="noreferrer">
            View recipe source <ExternalLink size={12} />
          </a>
        )}
      </div>
    </article>
  );
}
