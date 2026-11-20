import { existsSync } from "node:fs";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { resolve } from "node:path";

export interface RecipeNlgResult {
  id: number;
  title: string;
  ingredients: string[];
  directions: string[];
  link: string;
  source: string;
}

export interface RecipeNlgSearchOptions {
  source?: string;
  excludeIngredients?: string;
}

export class RecipeNlgIndexUnavailableError extends Error {
  constructor() {
    super("The local RecipeNLG index is missing. Run `npm run recipes:index` to build it.");
    this.name = "RecipeNlgIndexUnavailableError";
  }
}

const defaultIndexPath = resolve(
  import.meta.dirname,
  "../dataset/RecipeNLG_reviewer_index.sqlite",
);
const candidateLimit = 1000;

function readText(value: SQLOutputValue): string {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: SQLOutputValue): string[] {
  const serialized = readText(value);
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function buildRecipeSearchExpression(query: string): string {
  const terms = query.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
  return terms
    .slice(0, 8)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(" AND ");
}

export function buildRecipeExclusionExpression(value: string): string {
  return value
    .split(",")
    .map((phrase) => (phrase.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? []).join(" "))
    .filter(Boolean)
    .map((phrase) => `"${phrase.replace(/"/g, '""')}"`)
    .join(" OR ");
}

export function searchRecipeNlg(
  query: string,
  limit = 8,
  indexPath = defaultIndexPath,
  options: RecipeNlgSearchOptions = {},
): RecipeNlgResult[] {
  const expression = buildRecipeSearchExpression(query);
  if (!expression) return [];
  if (!existsSync(indexPath)) throw new RecipeNlgIndexUnavailableError();

  const safeLimit = Math.max(1, Math.min(21, Math.trunc(limit)));
  const exclusionExpression = buildRecipeExclusionExpression(options.excludeIngredients ?? "");
  const database = new DatabaseSync(indexPath, { readOnly: true });
  try {
    const filters = ["recipe_search MATCH ?"];
    const parameters: (string | number)[] = [expression];
    if (options.source) {
      filters.push("recipes.source = ?");
      parameters.push(options.source);
    }
    if (exclusionExpression) {
      filters.push(`NOT EXISTS (
        SELECT 1
        FROM recipe_search AS excluded
        WHERE excluded.rowid = recipe_search.rowid
          AND excluded.ingredients MATCH ?
      )`);
      parameters.push(exclusionExpression);
    }
    parameters.push(candidateLimit, safeLimit);

    const rows = database.prepare(
      `WITH matching AS MATERIALIZED (
         SELECT recipe_search.rowid, bm25(recipe_search, 5.0, 1.0) AS score
         FROM recipe_search
         JOIN recipes ON recipes.id = recipe_search.rowid
         WHERE ${filters.join(" AND ")}
         LIMIT ?
       )
       SELECT recipes.id, recipes.title, recipes.ingredients_json, recipes.directions_json,
              recipes.link, recipes.source
       FROM matching
       JOIN recipes ON recipes.id = matching.rowid
       ORDER BY matching.score
       LIMIT ?`,
    ).all(...parameters);

    return rows.flatMap((row) => {
      if (typeof row.id !== "number") return [];
      return [{
        id: row.id,
        title: readText(row.title),
        ingredients: readStringArray(row.ingredients_json),
        directions: readStringArray(row.directions_json),
        link: readText(row.link),
        source: readText(row.source),
      }];
    });
  } finally {
    database.close();
  }
}
