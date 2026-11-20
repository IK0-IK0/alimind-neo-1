import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path

EXPECTED_CONSTRUCTS = {"attitude", "subjective_norm", "perceived_control"}
REQUIRED_COLUMNS = {
    "respondent_id",
    "item_number",
    "question_prompt",
    "rating_1_to_7",
    "response_text",
    "construct_label_weak",
}

def parse_args():
    parser = argparse.ArgumentParser(
        description="Evaluate a frozen BERT + Ridge TPB rating regressor."
    )
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--model-id", default="bert-base-uncased")
    parser.add_argument("--batch-size", default=8, type=int)
    parser.add_argument("--max-length", default=128, type=int)
    parser.add_argument("--folds", default=5, type=int)
    parser.add_argument("--alpha", default=1.0, type=float)
    parser.add_argument("--seed", default=42, type=int)
    parser.add_argument("--artifact", type=Path)
    parser.add_argument("--metrics", type=Path)
    return parser.parse_args()


def load_records(dataset_path):
    with dataset_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames or not REQUIRED_COLUMNS.issubset(reader.fieldnames):
            raise ValueError("The CSV is missing required training columns.")
        if "intention_outcome_label_weak" in reader.fieldnames:
            raise ValueError("Remove intention rows before training this three-construct model.")

        records = []
        skipped_empty = 0
        for line_number, row in enumerate(reader, start=2):
            construct = row["construct_label_weak"]
            if construct not in EXPECTED_CONSTRUCTS:
                raise ValueError(f"Unexpected construct label on CSV line {line_number}.")

            try:
                item_number = int(row["item_number"])
                rating = int(row["rating_1_to_7"])
            except (TypeError, ValueError) as error:
                raise ValueError(f"Invalid item number or rating on CSV line {line_number}.") from error

            if not 14 <= item_number <= 70:
                raise ValueError(f"Intention or out-of-range item found on CSV line {line_number}.")
            if not 1 <= rating <= 7:
                raise ValueError(f"Rating outside 1–7 found on CSV line {line_number}.")
            respondent_id = row["respondent_id"].strip()
            prompt = row["question_prompt"].strip()
            response = row["response_text"].strip()
            if not respondent_id or not prompt:
                raise ValueError(f"Missing respondent ID or question on CSV line {line_number}.")
            if not response:
                skipped_empty += 1
                continue

            records.append({
                "respondent_id": respondent_id,
                "item_number": item_number,
                "construct": construct,
                "rating": rating,
                "text": f"Question: {prompt} Answer: {response}",
            })

    if not records:
        raise ValueError("No non-empty respondent answers are available for training.")
    respondent_count = len({record["respondent_id"] for record in records})
    if respondent_count < 2:
        raise ValueError("At least two respondents are required for held-out evaluation.")
    return records, skipped_empty, respondent_count


def calculate_metrics(actual, predicted):
    import numpy as np
    from scipy.stats import pearsonr

    actual = np.asarray(actual, dtype=np.float64)
    predicted = np.clip(np.asarray(predicted, dtype=np.float64), 1.0, 7.0)
    rounded = np.clip(np.rint(predicted), 1, 7)
    correlation = None
    if len(actual) >= 2 and np.std(actual) > 0 and np.std(predicted) > 0:
        correlation = float(pearsonr(actual, predicted).statistic)
    return {
        "count": int(len(actual)),
        "mae": float(np.mean(np.abs(actual - predicted))),
        "rmse": float(np.sqrt(np.mean(np.square(actual - predicted)))),
        "pearson_r": correlation,
        "exact_rounded_accuracy": float(np.mean(rounded == actual)),
        "within_1_accuracy": float(np.mean(np.abs(actual - predicted) <= 1.0)),
        "actual_mean": float(np.mean(actual)),
    }


def run():
    args = parse_args()
    if args.batch_size < 1 or args.max_length < 1 or args.folds < 2 or args.alpha <= 0:
        raise ValueError("Batch size, max length, folds, and alpha must be positive.")
    if not args.dataset.is_file():
        raise FileNotFoundError(f"Dataset not found: {args.dataset}")

    import numpy as np
    import torch
    from sklearn.linear_model import Ridge
    from sklearn.model_selection import StratifiedGroupKFold
    from transformers import AutoModel, AutoTokenizer

    records, skipped_empty, respondent_count = load_records(args.dataset)
    labels = np.asarray([record["rating"] for record in records], dtype=np.float64)
    groups = np.asarray([record["respondent_id"] for record in records])
    constructs = np.asarray([record["construct"] for record in records])
    item_numbers = np.asarray([record["item_number"] for record in records])
    texts = [record["text"] for record in records]
    unique_ratings, rating_counts = np.unique(labels.astype(int), return_counts=True)

    print("TPB respondent rating regression")
    print(f"Dataset: {args.dataset}")
    print(f"Respondents: {respondent_count}")
    print(f"Usable answer rows: {len(records)}; empty explanations skipped: {skipped_empty}")
    print("Constructs: attitude, subjective_norm, perceived_control; intention excluded")
    print("Rating counts: " + json.dumps({
        str(int(rating)): int(count) for rating, count in zip(unique_ratings, rating_counts)
    }))
    print(f"Model: {args.model_id}")
    print(f"Device: {'CUDA' if torch.cuda.is_available() else 'CPU'}")
    torch.set_num_threads(min(4, os.cpu_count() or 1))

    print("Loading tokenizer and frozen BERT encoder...")
    tokenizer = AutoTokenizer.from_pretrained(args.model_id)
    encoder = AutoModel.from_pretrained(args.model_id)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    encoder.to(device)
    encoder.eval()

    embeddings = []
    embedding_started = time.perf_counter()
    with torch.inference_mode():
        for start in range(0, len(texts), args.batch_size):
            batch_texts = texts[start : start + args.batch_size]
            batch = tokenizer(
                batch_texts,
                padding=True,
                truncation=True,
                max_length=args.max_length,
                return_tensors="pt",
            ).to(device)
            output = encoder(**batch).last_hidden_state
            mask = batch["attention_mask"].unsqueeze(-1).to(output.dtype)
            pooled = (output * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)
            embeddings.append(pooled.cpu().numpy().astype(np.float32, copy=False))
            completed = min(start + len(batch_texts), len(texts))
            print(f"Embedding progress: {completed}/{len(texts)}")
    embedding_seconds = time.perf_counter() - embedding_started
    features = np.concatenate(embeddings, axis=0)

    splitter = StratifiedGroupKFold(
        n_splits=args.folds,
        shuffle=True,
        random_state=args.seed,
    )
    out_of_fold = np.full(len(records), np.nan, dtype=np.float64)
    fold_sizes = []
    baseline_out_of_fold = np.full(len(records), np.nan, dtype=np.float64)
    item_baseline_out_of_fold = np.full(len(records), np.nan, dtype=np.float64)
    for fold_number, (train_indices, test_indices) in enumerate(
        splitter.split(features, labels, groups=groups),
        start=1,
    ):
        model = Ridge(alpha=args.alpha)
        model.fit(features[train_indices], labels[train_indices])
        out_of_fold[test_indices] = model.predict(features[test_indices])
        baseline_out_of_fold[test_indices] = float(np.median(labels[train_indices]))
        item_means = {
            int(item_number): float(np.mean(labels[train_indices[item_numbers[train_indices] == item_number]]))
            for item_number in np.unique(item_numbers[train_indices])
        }
        item_baseline_out_of_fold[test_indices] = [
            item_means.get(int(item_numbers[index]), float(np.median(labels[train_indices])))
            for index in test_indices
        ]
        fold_sizes.append({
            "fold": fold_number,
            "train_rows": int(len(train_indices)),
            "test_rows": int(len(test_indices)),
            "train_respondents": int(len(set(groups[train_indices]))),
            "test_respondents": int(len(set(groups[test_indices]))),
        })
        print(
            f"Fold {fold_number}/{args.folds}: "
            f"train={len(train_indices)} rows/{len(set(groups[train_indices]))} respondents; "
            f"test={len(test_indices)} rows/{len(set(groups[test_indices]))} respondents"
        )

    if np.isnan(out_of_fold).any():
        raise RuntimeError("Cross-validation did not produce predictions for every row.")

    metrics = {
        "model": args.model_id,
        "method": "Frozen BERT attention-mask mean pooling + Ridge regression",
        "evaluation": "StratifiedGroupKFold out-of-fold; all rows for a respondent stay in one fold",
        "respondent_count": respondent_count,
        "usable_answer_rows": len(records),
        "empty_explanations_skipped": skipped_empty,
        "constructs": sorted(EXPECTED_CONSTRUCTS),
        "intention_included": False,
        "rating_distribution": {
            str(int(rating)): int(count) for rating, count in zip(unique_ratings, rating_counts)
        },
        "folds": fold_sizes,
        "overall": {
            "bert_ridge": calculate_metrics(labels, out_of_fold),
            "training_fold_median_baseline": calculate_metrics(labels, baseline_out_of_fold),
            "training_fold_item_mean_baseline": calculate_metrics(labels, item_baseline_out_of_fold),
        },
        "by_construct": {},
        "embedding_latency_ms_per_sample": embedding_seconds * 1000 / len(texts),
        "embedding_total_seconds": embedding_seconds,
        "ridge_alpha": args.alpha,
        "max_length": args.max_length,
        "batch_size": args.batch_size,
        "note": (
            "Pilot-only estimate from 30 respondents. Construct labels come from the survey item, "
            "not human annotation of answer text. Do not interpret these metrics as validated "
            "generalization or as a construct classifier."
        ),
    }
    for construct in sorted(EXPECTED_CONSTRUCTS):
        mask = constructs == construct
        metrics["by_construct"][construct] = {
            "bert_ridge": calculate_metrics(labels[mask], out_of_fold[mask]),
            "training_fold_median_baseline": calculate_metrics(
                labels[mask],
                baseline_out_of_fold[mask],
            ),
            "training_fold_item_mean_baseline": calculate_metrics(
                labels[mask],
                item_baseline_out_of_fold[mask],
            ),
        }

    print("Cross-validation complete; held-out respondents were not used for fold training.")
    print("Overall held-out metrics: " + json.dumps(metrics["overall"], sort_keys=True))
    for construct, values in metrics["by_construct"].items():
        print(f"{construct} held-out metrics: " + json.dumps(values, sort_keys=True))
    print(f"Embedding latency: {metrics['embedding_latency_ms_per_sample']:.2f} ms/sample")

    if args.artifact:
        final_model = Ridge(alpha=args.alpha)
        final_model.fit(features, labels)
        args.artifact.parent.mkdir(parents=True, exist_ok=True)
        import joblib

        joblib.dump({
            "model_id": args.model_id,
            "ridge_head": final_model,
            "constructs": sorted(EXPECTED_CONSTRUCTS),
            "input_format": "Question: {question_prompt} Answer: {response_text}",
            "max_length": args.max_length,
            "training_rows": len(records),
            "respondent_count": respondent_count,
            "encoder_note": "Load the named frozen BERT encoder and mean-pool its embeddings before applying ridge_head.",
            "note": "Experimental pilot model; not validated for production use.",
        }, args.artifact)
        metrics["artifact"] = str(args.artifact)
        print(f"Saved final Ridge artifact: {args.artifact}")

    if args.metrics:
        args.metrics.parent.mkdir(parents=True, exist_ok=True)
        args.metrics.write_text(json.dumps(metrics, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        print(f"Saved metrics: {args.metrics}")

    print("Run completed.")


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        print(f"Training failed: {type(error).__name__}: {error}", file=sys.stderr)
        raise
