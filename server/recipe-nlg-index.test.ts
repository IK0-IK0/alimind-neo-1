import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildRecipeExclusionExpression,
  buildRecipeSearchExpression,
  searchRecipeNlg,
} from "./recipe-nlg-index";

const temporaryDirectories: string[] = [];

function createTestIndex() {
  const directory = mkdtempSync(join(tmpdir(), "alimind-recipenlg-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "recipes.sqlite");
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE recipes (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      ingredients_json TEXT NOT NULL,
      directions_json TEXT NOT NULL,
      link TEXT NOT NULL,
      source TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE recipe_search USING fts5(title, ingredients);
  `);
  database.prepare("INSERT INTO recipes VALUES (?, ?, ?, ?, ?, ?)").run(
    1,
    "Chicken Adobo",
    JSON.stringify(["chicken", "soy sauce", "vinegar"]),
    JSON.stringify(["Simmer until tender."]),
    "https://example.com/adobo",
    "Gathered",
  );
  database.prepare("INSERT INTO recipe_search(rowid, title, ingredients) VALUES (?, ?, ?)").run(
    1,
    "Chicken Adobo",
    "chicken soy sauce vinegar",
  );
  database.close();
  return path;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("RecipeNLG reviewer search", () => {
  it("searches titles and ingredients and returns parsed recipe details", () => {
    const indexPath = createTestIndex();

    expect(searchRecipeNlg("chicken adobo", 8, indexPath)).toEqual([
      {
        id: 1,
        title: "Chicken Adobo",
        ingredients: ["chicken", "soy sauce", "vinegar"],
        directions: ["Simmer until tender."],
        link: "https://example.com/adobo",
        source: "Gathered",
      },
    ]);
  });

  it("treats FTS punctuation as ordinary query text", () => {
    expect(buildRecipeSearchExpression('" OR *')).toBe('"OR"');
    expect(searchRecipeNlg('" OR *', 8, createTestIndex())).toEqual([]);
  });

  it("filters by dataset collection and excludes matching ingredients", () => {
    const indexPath = createTestIndex();
    expect(buildRecipeExclusionExpression("soy sauce, peanuts")).toBe('"soy sauce" OR "peanuts"');
    expect(searchRecipeNlg("chicken adobo", 8, indexPath, { source: "Recipes1M" })).toEqual([]);
    expect(searchRecipeNlg("chicken adobo", 8, indexPath, { excludeIngredients: "soy sauce" })).toEqual([]);
    expect(searchRecipeNlg("chicken adobo", 8, indexPath, { excludeIngredients: "peanuts" })).toHaveLength(1);
  });
});
