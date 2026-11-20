import argparse
import csv
import json
import sqlite3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "dataset" / "RecipeNLG_dataset.csv"
DEFAULT_OUTPUT = ROOT / "dataset" / "RecipeNLG_reviewer_index.sqlite"
BATCH_SIZE = 2000


def parse_array(value):
    try:
        parsed = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [item.strip() for item in parsed if isinstance(item, str) and item.strip()]


def build_index(source_path, output_path):
    if not source_path.is_file():
        raise FileNotFoundError(f"RecipeNLG CSV not found: {source_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_name(output_path.name + ".tmp")
    if temporary_path.exists():
        temporary_path.unlink()

    connection = sqlite3.connect(temporary_path)
    try:
        connection.execute("PRAGMA journal_mode = OFF")
        connection.execute("PRAGMA synchronous = OFF")
        connection.execute("PRAGMA temp_store = MEMORY")
        connection.execute("PRAGMA cache_size = -64000")
        connection.executescript(
            """
            CREATE TABLE recipes (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                ingredients_json TEXT NOT NULL,
                directions_json TEXT NOT NULL,
                link TEXT NOT NULL,
                source TEXT NOT NULL
            );
            CREATE VIRTUAL TABLE recipe_search USING fts5(
                title,
                ingredients,
                tokenize = 'unicode61 remove_diacritics 2'
            );
            """
        )

        recipe_rows = []
        search_rows = []
        indexed_count = 0

        with source_path.open("r", encoding="utf-8-sig", newline="") as source_file:
            reader = csv.DictReader(source_file)
            for record in reader:
                title = (record.get("title") or "").strip()
                if not title:
                    continue
                ingredients = parse_array(record.get("ingredients"))
                directions = parse_array(record.get("directions"))
                indexed_count += 1
                recipe_rows.append(
                    (
                        indexed_count,
                        title,
                        json.dumps(ingredients, ensure_ascii=False),
                        json.dumps(directions, ensure_ascii=False),
                        (record.get("link") or "").strip(),
                        (record.get("source") or "").strip(),
                    )
                )
                search_rows.append(
                    (indexed_count, title, " ".join(ingredients))
                )

                if len(recipe_rows) >= BATCH_SIZE:
                    connection.executemany(
                        "INSERT INTO recipes VALUES (?, ?, ?, ?, ?, ?)",
                        recipe_rows,
                    )
                    connection.executemany(
                        "INSERT INTO recipe_search(rowid, title, ingredients) VALUES (?, ?, ?)",
                        search_rows,
                    )
                    connection.commit()
                    recipe_rows.clear()
                    search_rows.clear()
                    if indexed_count % 100000 == 0:
                        print(f"Indexed {indexed_count:,} recipes...", flush=True)

        if recipe_rows:
            connection.executemany(
                "INSERT INTO recipes VALUES (?, ?, ?, ?, ?, ?)",
                recipe_rows,
            )
            connection.executemany(
                "INSERT INTO recipe_search(rowid, title, ingredients) VALUES (?, ?, ?)",
                search_rows,
            )
            connection.commit()
    except Exception:
        connection.close()
        if temporary_path.exists():
            temporary_path.unlink()
        raise
    else:
        connection.close()

    temporary_path.replace(output_path)
    print(f"Indexed {indexed_count:,} recipes into {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Create a local full-text index for the reviewer recipe picker."
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    build_index(args.source, args.output)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Could not build the RecipeNLG index: {error}", file=sys.stderr)
        raise
