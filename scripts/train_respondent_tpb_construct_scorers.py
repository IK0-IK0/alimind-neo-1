import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path

from score_respondent_tpb import PAIR_SETS, calculate_scores, load_ratings

CONSTRUCTS = tuple(PAIR_SETS)
EXPECTED_CONSTRUCT_LABELS = {
    "attitude",
    "subjective_norm",
    "perceived_control",
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Train frozen BERT + Ridge predictors for exploratory TPB belief-product scores."
    )
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--model-id", default="bert-base-uncased")
    parser.add_argument("--batch-size", default=8, type=int)
    parser.add_argument("--max-length", default=128, type=int)
    parser.add_argument("--folds", default=5, type=int)
    parser.add_argument("--alpha", default=1.0, type=float)
    parser.add_argument("--artifact", type=Path)
    parser.add_argument("--metrics", type=Path)
    return parser.parse_args()


def load_answer_texts(dataset_path, expected_respondents):
    required = {
        "respondent_id",
        "item_number",
        "question_prompt",
        "response_text",
        "construct_label_weak",
    }
    answers = {}
    with dataset_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError("The CSV is missing required text, item, or construct columns.")
        if "intention_outcome_label_weak" in reader.fieldnames:
            raise ValueError("Intention rows must be excluded from this three-construct model.")

        for line_number, row in enumerate(reader, start=2):
            respondent_id = row["respondent_id"].strip()
            try:
                item_number = int(row["item_number"])
            except (TypeError, ValueError) as error:
                raise ValueError(f"Invalid item number on CSV line {line_number}.") from error
            construct = row["construct_label_weak"].strip()
            if construct not in EXPECTED_CONSTRUCT_LABELS:
                raise ValueError(f"Unexpected construct on CSV line {line_number}.")
            key = (respondent_id, item_number)
            if key in answers:
                raise ValueError(f"Duplicate answer row on CSV line {line_number}.")
            answers[key] = {
                "prompt": row["question_prompt"].strip(),
                "response": row["response_text"].strip(),
            }

    if {respondent_id for respondent_id, _ in answers} != expected_respondents:
        raise ValueError("Text rows and scoring rows do not contain the same respondents.")
    return answers


def calculate_metrics(actual, predicted):
    import numpy as np
    from scipy.stats import pearsonr

    actual = np.asarray(actual, dtype=np.float64)
    predicted = np.clip(np.asarray(predicted, dtype=np.float64), 1.0, 49.0)
    correlation = None
    if len(actual) >= 2 and np.std(actual) > 0 and np.std(predicted) > 0:
        correlation = float(pearsonr(actual, predicted).statistic)
    return {
        "count": int(len(actual)),
        "mae": float(np.mean(np.abs(actual - predicted))),
        "rmse": float(np.sqrt(np.mean(np.square(actual - predicted)))),
        "pearson_r": correlation,
        "actual_mean": float(np.mean(actual)),
        "prediction_mean": float(np.mean(predicted)),
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
    from sklearn.model_selection import GroupKFold
    from transformers import AutoModel, AutoTokenizer

    ratings = load_ratings(args.dataset)
    summaries, _ = calculate_scores(ratings)
    summary_by_id = {row["respondent_id"]: row for row in summaries}
    respondent_ids = sorted(summary_by_id)
    answer_texts = load_answer_texts(args.dataset, set(respondent_ids))

    construct_items = {
        construct: sorted({
            item
            for belief_item, paired_item in pairs
            for item in (belief_item, paired_item)
        })
        for construct, pairs in PAIR_SETS.items()
    }
    embedding_keys = sorted({
        (respondent_id, item_number)
        for respondent_id in respondent_ids
        for construct in CONSTRUCTS
        for item_number in construct_items[construct]
        if answer_texts[(respondent_id, item_number)]["response"]
    })
    if not embedding_keys:
        raise ValueError("No non-empty paired-item explanations were found.")

    print("TPB construct-score regression")
    print(f"Respondents: {len(respondent_ids)}")
    print("Targets: exploratory paired belief-product means on a 1–49 scale")
    print("Constructs: attitude, subjective_norm, perceived_control; intention excluded")
    print(f"Unique paired-item answers to embed: {len(embedding_keys)}")
    print(f"Model: {args.model_id}")
    print(f"Device: {'CUDA' if torch.cuda.is_available() else 'CPU'}")
    torch.set_num_threads(min(4, os.cpu_count() or 1))

    print("Loading tokenizer and frozen BERT encoder...")
    tokenizer = AutoTokenizer.from_pretrained(args.model_id)
    encoder = AutoModel.from_pretrained(args.model_id)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    encoder.to(device)
    encoder.eval()

    embedded_answers = {}
    embedding_started = time.perf_counter()
    with torch.inference_mode():
        for start in range(0, len(embedding_keys), args.batch_size):
            batch_keys = embedding_keys[start : start + args.batch_size]
            texts = [
                f"Question: {answer_texts[key]['prompt']} Answer: {answer_texts[key]['response']}"
                for key in batch_keys
            ]
            batch = tokenizer(
                texts,
                padding=True,
                truncation=True,
                max_length=args.max_length,
                return_tensors="pt",
            ).to(device)
            output = encoder(**batch).last_hidden_state
            mask = batch["attention_mask"].unsqueeze(-1).to(output.dtype)
            pooled = (output * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)
            for key, vector in zip(batch_keys, pooled.cpu().numpy()):
                embedded_answers[key] = vector.astype(np.float32, copy=False)
            completed = min(start + len(batch_keys), len(embedding_keys))
            print(f"Embedding progress: {completed}/{len(embedding_keys)}")
    embedding_seconds = time.perf_counter() - embedding_started

    fold_count = min(args.folds, len(respondent_ids))
    splitter = GroupKFold(n_splits=fold_count)
    ridge_heads = {}
    metrics_by_construct = {}
    fold_details = {}

    for construct in CONSTRUCTS:
        items = construct_items[construct]
        features = []
        targets = []
        groups = []
        for respondent_id in respondent_ids:
            respondent_vectors = [
                embedded_answers[(respondent_id, item_number)]
                for item_number in items
                if (respondent_id, item_number) in embedded_answers
            ]
            if not respondent_vectors:
                raise ValueError(f"A respondent has no text evidence for {construct}.")
            features.append(np.mean(respondent_vectors, axis=0, dtype=np.float64))
            targets.append(summary_by_id[respondent_id][f"{construct}_belief_product_mean"])
            groups.append(respondent_id)
        features = np.asarray(features, dtype=np.float64)
        targets = np.asarray(targets, dtype=np.float64)
        groups = np.asarray(groups)
        predictions = np.full(len(targets), np.nan, dtype=np.float64)
        fold_details[construct] = []

        for fold_number, (train_indices, test_indices) in enumerate(
            splitter.split(features, targets, groups=groups),
            start=1,
        ):
            model = Ridge(alpha=args.alpha)
            model.fit(features[train_indices], targets[train_indices])
            predictions[test_indices] = model.predict(features[test_indices])
            fold_details[construct].append({
                "fold": fold_number,
                "train_respondents": int(len(train_indices)),
                "test_respondents": int(len(test_indices)),
                "test_mae": float(np.mean(np.abs(
                    targets[test_indices] - np.clip(predictions[test_indices], 1.0, 49.0)
                ))),
            })
            print(
                f"{construct} fold {fold_number}/{fold_count}: "
                f"train={len(train_indices)} respondents; test={len(test_indices)} respondents"
            )

        if np.isnan(predictions).any():
            raise RuntimeError(f"Cross-validation did not predict every {construct} target.")
        baseline = np.full(len(targets), np.nan, dtype=np.float64)
        for train_indices, test_indices in splitter.split(features, targets, groups=groups):
            baseline[test_indices] = float(np.mean(targets[train_indices]))

        metrics_by_construct[construct] = {
            "target_range": [1, 49],
            "paired_items": items,
            "belief_pair_count": len(PAIR_SETS[construct]),
            "bert_ridge": calculate_metrics(targets, predictions),
            "training_mean_baseline": calculate_metrics(targets, baseline),
            "folds": fold_details[construct],
        }
        final_head = Ridge(alpha=args.alpha)
        final_head.fit(features, targets)
        ridge_heads[construct] = final_head
        print(
            f"{construct} held-out metrics: "
            + json.dumps(metrics_by_construct[construct]["bert_ridge"], sort_keys=True)
        )

    metrics = {
        "model": args.model_id,
        "method": "Frozen BERT mean-pooled item embeddings, averaged by respondent and construct; Ridge regression",
        "target": "Exploratory TPB belief-product mean, calculated as the mean of prespecified paired 1–7 rating products",
        "evaluation": "Five-fold GroupKFold; respondents are held out as whole groups",
        "respondent_count": len(respondent_ids),
        "constructs": list(CONSTRUCTS),
        "intention_included": False,
        "direct_means_are_training_targets": False,
        "ridge_alpha": args.alpha,
        "max_length": args.max_length,
        "batch_size": args.batch_size,
        "unique_paired_answers_embedded": len(embedding_keys),
        "embedding_latency_ms_per_answer": embedding_seconds * 1000 / len(embedding_keys),
        "embedding_total_seconds": embedding_seconds,
        "by_construct": metrics_by_construct,
        "scoring_assumptions": {
            "attitude_pairs": [list(pair) for pair in PAIR_SETS["attitude"]],
            "subjective_norm_pairs": [list(pair) for pair in PAIR_SETS["subjective_norm"]],
            "perceived_control_pairs": [list(pair) for pair in PAIR_SETS["perceived_control"]],
            "reverse_scoring": "none",
            "status": "exploratory; verify instrument pairings, scale anchors, and item polarity",
        },
        "note": (
            "Pilot-only results from 30 respondents. Text answers predict formula-derived scores; "
            "this is not a validated model, and the sample is too small to establish generalization."
        ),
    }

    if args.artifact:
        args.artifact.parent.mkdir(parents=True, exist_ok=True)
        import joblib

        joblib.dump({
            "model_id": args.model_id,
            "ridge_heads": ridge_heads,
            "constructs": list(CONSTRUCTS),
            "construct_items": construct_items,
            "input_format": "Question: {question_prompt} Answer: {response_text}",
            "aggregation": "Mean-pool each answer with BERT, then average item embeddings within construct and respondent.",
            "target_range": [1, 49],
            "max_length": args.max_length,
            "ridge_alpha": args.alpha,
            "scoring_assumptions": metrics["scoring_assumptions"],
            "respondent_count": len(respondent_ids),
            "note": "Experimental pilot model; not validated for production use.",
        }, args.artifact)
        metrics["artifact"] = str(args.artifact)
        print(f"Saved construct Ridge heads: {args.artifact}")

    if args.metrics:
        args.metrics.parent.mkdir(parents=True, exist_ok=True)
        args.metrics.write_text(
            json.dumps(metrics, indent=2, allow_nan=False) + "\n",
            encoding="utf-8",
        )
        print(f"Saved metrics: {args.metrics}")
    print("Run completed.")


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        print(f"Construct-score training failed: {type(error).__name__}: {error}", file=sys.stderr)
        raise
