export function pickRandomRecipe<T>(
  recipes: T[],
  random = Math.random,
): T | null {
  if (recipes.length === 0) return null;
  const index = Math.min(recipes.length - 1, Math.floor(random() * recipes.length));
  return recipes[index] ?? null;
}
