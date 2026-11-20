import argparse
import csv
import statistics
import sys
from pathlib import Path

ATTITUDE_PAIRS = (
    (14, 24),
    (15, 25),
    (16, 26),
    (17, 27),
    (18, 28),
    (19, 29),
    (20, 30),
    (21, 31),
    (22, 32),
)
SUBJECTIVE_NORM_PAIRS = (
    (38, 43),
    (39, 44),
    (40, 45),
    (41, 46),
)
PERCEIVED_CONTROL_PAIRS = (
    (50, 60),
    (51, 61),
    (52, 62),
    (53, 63),
    (55, 64),
    (56, 65),
)
DIRECT_ITEMS = {
    "attitude": (33, 34, 35, 36, 37),
    "subjective_norm": (47, 48, 49),
    "perceived_control": (66, 67, 68, 69, 70),
}
PAIR_SETS = {
    "attitude": ATTITUDE_PAIRS,
    "subjective_norm": SUBJECTIVE_NORM_PAIRS,
    "perceived_control": PERCEIVED_CONTROL_PAIRS,
}
EXPECTED_ITEMS = set(range(14, 71))
REQUIRED_COLUMNS = {"respondent_id", "item_number", "rating_1_to_7"}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Calculate exploratory TPB belief-product and direct scores."
    )
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def load_ratings(dataset_path):
    with dataset_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames or not REQUIRED_COLUMNS.issubset(reader.fieldnames):
            raise ValueError("The CSV is missing respondent IDs, item numbers, or ratings.")

        ratings = {}
        for line_number, row in enumerate(reader, start=2):
            respondent_id = row["respondent_id"].strip()
            try:
                item_number = int(row["item_number"])
                rating = int(row["rating_1_to_7"])
            except (TypeError, ValueError) as error:
                raise ValueError(f"Invalid item number or rating on CSV line {line_number}.") from error

            if not respondent_id:
                raise ValueError(f"Missing respondent ID on CSV line {line_number}.")
            if item_number not in EXPECTED_ITEMS:
                raise ValueError(f"Intention or out-of-range item on CSV line {line_number}.")
            if not 1 <= rating <= 7:
                raise ValueError(f"Rating outside 1–7 on CSV line {line_number}.")
            respondent_ratings = ratings.setdefault(respondent_id, {})
            if item_number in respondent_ratings:
                raise ValueError(f"Duplicate item {item_number} for one respondent.")
            respondent_ratings[item_number] = rating

    if not ratings:
        raise ValueError("No respondent ratings were found.")
    for respondent_id, respondent_ratings in ratings.items():
        missing = EXPECTED_ITEMS - respondent_ratings.keys()
        if missing:
            raise ValueError(
                f"Respondent {respondent_id} is missing {len(missing)} required rating items."
            )
    return ratings


def calculate_scores(ratings):
    summaries = []
    pair_rows = []
    for respondent_id, respondent_ratings in sorted(ratings.items()):
        summary = {"respondent_id": respondent_id}
        for construct, pairs in PAIR_SETS.items():
            products = []
            for belief_item, second_item in pairs:
                belief_rating = respondent_ratings[belief_item]
                second_rating = respondent_ratings[second_item]
                product = belief_rating * second_rating
                products.append(product)
                pair_rows.append({
                    "respondent_id": respondent_id,
                    "construct": construct,
                    "belief_item": belief_item,
                    "paired_item": second_item,
                    "belief_rating": belief_rating,
                    "paired_rating": second_rating,
                    "product": product,
                })
            summary[f"{construct}_belief_product_count"] = len(products)
            summary[f"{construct}_belief_product_sum"] = sum(products)
            summary[f"{construct}_belief_product_mean"] = statistics.mean(products)

        for construct, item_numbers in DIRECT_ITEMS.items():
            item_ratings = [respondent_ratings[item] for item in item_numbers]
            summary[f"{construct}_direct_item_count"] = len(item_ratings)
            summary[f"{construct}_direct_mean"] = statistics.mean(item_ratings)
        summaries.append(summary)
    return summaries, pair_rows


def write_workbook(output_path, summaries, pair_rows):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    output_path.parent.mkdir(parents=True, exist_ok=True)
    workbook = Workbook()
    scores_sheet = workbook.active
    scores_sheet.title = "TPB Scores"
    score_headers = list(summaries[0].keys())
    scores_sheet.append(score_headers)
    for row in summaries:
        scores_sheet.append([row[header] for header in score_headers])

    pair_sheet = workbook.create_sheet("Pair Details")
    pair_headers = list(pair_rows[0].keys())
    pair_sheet.append(pair_headers)
    for row in pair_rows:
        pair_sheet.append([row[header] for header in pair_headers])

    key_sheet = workbook.create_sheet("Scoring Key")
    key_rows = [
        ("Status", "Exploratory; verify official anchors, item polarity, and pairings before interpretation."),
        ("Input", "Pseudonymous respondent ratings from items 14–70; no names, emails, or free-text answers."),
        ("Formula", "Belief-based score = sum and mean of paired 1–7 rating products."),
        ("Attitude pairs", "Q14×Q24, Q15×Q25, Q16×Q26, Q17×Q27, Q18×Q28, Q19×Q29, Q20×Q30, Q21×Q31, Q22×Q32."),
        ("Subjective norm pairs", "Q38×Q43, Q39×Q44, Q40×Q45, Q41×Q46."),
        ("Perceived control pairs", "Q50×Q60, Q51×Q61, Q52×Q62, Q53×Q63, Q55×Q64, Q56×Q65."),
        ("Direct attitude items", "Q33–Q37; reported as arithmetic mean."),
        ("Direct subjective norm items", "Q47–Q49; reported as arithmetic mean."),
        ("Direct perceived control items", "Q66–Q70; reported as arithmetic mean."),
        ("Unpaired attitude item", "Q23 is excluded from the attitude belief-product score."),
        ("Unpaired subjective norm item", "Q42 is excluded from the subjective-norm belief-product score."),
        ("Unpaired perceived-control items", "Q54 and Q57–Q59 are excluded from the perceived-control belief-product score."),
        ("Reverse scoring", "None applied; all ratings are used as recorded."),
        ("Intention", "Excluded."),
        ("Privacy", "Respondent IDs are pseudonymous; this workbook contains no direct identifiers or response text."),
    ]
    for row in key_rows:
        key_sheet.append(row)

    header_fill = PatternFill("solid", fgColor="DCE9D8")
    for sheet in (scores_sheet, pair_sheet):
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = sheet.dimensions
        for cell in sheet[1]:
            cell.font = Font(bold=True, color="24372A")
            cell.fill = header_fill
        for column_cells in sheet.columns:
            width = min(max(len(str(cell.value or "")) for cell in column_cells) + 2, 34)
            sheet.column_dimensions[get_column_letter(column_cells[0].column)].width = width
    key_sheet.column_dimensions["A"].width = 28
    key_sheet.column_dimensions["B"].width = 110
    for row in key_sheet.iter_rows():
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    workbook.save(output_path)


def main():
    args = parse_args()
    if not args.dataset.is_file():
        raise FileNotFoundError(f"Input dataset not found: {args.dataset}")
    ratings = load_ratings(args.dataset)
    summaries, pair_rows = calculate_scores(ratings)
    write_workbook(args.output, summaries, pair_rows)
    print(f"Respondents scored: {len(summaries)}")
    print(f"Belief-pair calculations: {len(pair_rows)}")
    print("Constructs: attitude, subjective norm, perceived behavioral control")
    print("Direct means: included; intention: excluded")
    print("Reverse scoring: none; interpretation: exploratory")
    print(f"Saved anonymized workbook: {args.output}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"TPB scoring failed: {type(error).__name__}: {error}", file=sys.stderr)
        raise
