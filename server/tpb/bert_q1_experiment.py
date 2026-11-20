import json
import math
import sys

MODEL_ID = "bert-base-uncased"
QUESTION = (
    "Eating nutritious meals daily for the next month would help me maintain "
    "good overall health."
)
SCORE_VALUES = (1, 2, 3, 4, 5, 6, 7)
TRAIN_PER_GROUP = 6
CALIBRATION_PER_GROUP = 2
MAX_ANSWER_LENGTH = 2000


def gaussian_probabilities(prediction, bias, sigma):
    mean = min(7.0, max(1.0, prediction + bias))
    spread = max(0.35, sigma)

    def cdf(value):
        return 0.5 * (1.0 + math.erf((value - mean) / (spread * math.sqrt(2.0))))

    probabilities = []
    for score in SCORE_VALUES:
        if score == 1:
            probability = cdf(1.5)
        elif score == 7:
            probability = 1.0 - cdf(6.5)
        else:
            probability = cdf(score + 0.5) - cdf(score - 0.5)
        probabilities.append(max(0.0, probability))
    total = sum(probabilities)
    if total <= 0.0:
        raise ValueError("Could not normalize score probabilities.")
    return [probability / total for probability in probabilities]


def grouped_split(group_count):
    if group_count < TRAIN_PER_GROUP + CALIBRATION_PER_GROUP + 1:
        raise ValueError("Each score group needs at least nine examples for this demo split.")
    train = list(range(TRAIN_PER_GROUP))
    calibration = list(range(TRAIN_PER_GROUP, TRAIN_PER_GROUP + CALIBRATION_PER_GROUP))
    test = list(range(TRAIN_PER_GROUP + CALIBRATION_PER_GROUP, group_count))
    return train, calibration, test


def mean_absolute_error(actual, predicted):
    return sum(abs(left - right) for left, right in zip(actual, predicted)) / len(actual)


def brier_score(actual, distributions):
    total = 0.0
    for label, probabilities in zip(actual, distributions):
        total += sum(
            (probability - (1.0 if score == label else 0.0)) ** 2
            for score, probability in zip(SCORE_VALUES, probabilities)
        )
    return total / len(actual)


def expected_calibration_error(actual, distributions):
    entries = []
    for label, probabilities in zip(actual, distributions):
        best_index = max(range(len(probabilities)), key=probabilities.__getitem__)
        entries.append((probabilities[best_index], SCORE_VALUES[best_index] == label))

    bin_count = min(5, len(entries))
    entries.sort(key=lambda entry: entry[0])
    total_error = 0.0
    for bin_index in range(bin_count):
        start = bin_index * len(entries) // bin_count
        end = (bin_index + 1) * len(entries) // bin_count
        batch = entries[start:end]
        if not batch:
            continue
        average_confidence = sum(item[0] for item in batch) / len(batch)
        accuracy = sum(1.0 if item[1] else 0.0 for item in batch) / len(batch)
        total_error += len(batch) / len(entries) * abs(average_confidence - accuracy)
    return total_error


def self_test():
    train, calibration, test = grouped_split(10)
    assert (len(train), len(calibration), len(test)) == (6, 2, 2)
    probabilities = gaussian_probabilities(4.0, 0.0, 1.0)
    assert len(probabilities) == 7
    assert abs(sum(probabilities) - 1.0) < 1e-9
    assert max(range(7), key=probabilities.__getitem__) == 3
    assert brier_score([4], [probabilities]) >= 0.0
    assert 0.0 <= expected_calibration_error([4], [probabilities]) <= 1.0
    print("TPB Q1 Python experiment self-test passed.")


def run_experiment(payload):
    import numpy as np
    import torch
    from transformers import AutoModel, AutoTokenizer

    response = payload.get("response")
    groups = payload.get("groups")
    if not isinstance(response, str) or not response.strip() or len(response) > MAX_ANSWER_LENGTH:
        raise ValueError("Enter a Q1 response of 1–2000 characters.")
    if not isinstance(groups, list) or len(groups) != len(SCORE_VALUES):
        raise ValueError("The synthetic reference set must contain all seven score groups.")

    by_score = {}
    for group in groups:
        if not isinstance(group, dict) or group.get("score") not in SCORE_VALUES:
            raise ValueError("A synthetic reference group has an invalid score.")
        score = group["score"]
        answers = group.get("answers")
        if score in by_score or not isinstance(answers, list) or not all(
            isinstance(answer, str) and answer.strip() for answer in answers
        ):
            raise ValueError("Each score group must contain unique, non-empty synthetic answers.")
        by_score[score] = answers
    if set(by_score) != set(SCORE_VALUES):
        raise ValueError("The synthetic references must cover score groups 1 through 7.")

    train_local, calibration_local, test_local = grouped_split(len(by_score[1]))
    if any(len(by_score[score]) != len(by_score[1]) for score in SCORE_VALUES):
        raise ValueError("Every score group must have the same number of synthetic answers.")
    train_indices = []
    calibration_indices = []
    test_indices = []
    labels = []
    texts = []
    for score in SCORE_VALUES:
        start = len(texts)
        texts.extend(f"Question: {QUESTION} Answer: {answer}" for answer in by_score[score])
        labels.extend([score] * len(by_score[score]))
        train_indices.extend(start + index for index in train_local)
        calibration_indices.extend(start + index for index in calibration_local)
        test_indices.extend(start + index for index in test_local)

    query_index = len(texts)
    texts.append(f"Question: {QUESTION} Answer: {response.strip()}")
    torch.set_num_threads(2)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModel.from_pretrained(MODEL_ID)
    model.eval()
    embeddings = []
    with torch.inference_mode():
        for start in range(0, len(texts), 4):
            batch = tokenizer(
                texts[start : start + 4],
                padding=True,
                truncation=True,
                max_length=128,
                return_tensors="pt",
            )
            output = model(**batch).last_hidden_state
            mask = batch["attention_mask"].unsqueeze(-1).to(output.dtype)
            pooled = (output * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)
            embeddings.extend(pooled.cpu().numpy())

    features = np.asarray(embeddings, dtype=np.float64)
    targets = np.asarray(labels, dtype=np.float64)
    train_features = features[train_indices]
    feature_mean = train_features.mean(axis=0)
    target_mean = targets[train_indices].mean()
    centered_train = train_features - feature_mean
    gram = centered_train @ centered_train.T
    weights = centered_train.T @ np.linalg.solve(
        gram + np.eye(len(train_indices), dtype=np.float64),
        targets[train_indices] - target_mean,
    )

    def predict(indices):
        return (features[indices] - feature_mean) @ weights + target_mean

    calibration_predictions = predict(calibration_indices)
    calibration_labels = targets[calibration_indices]
    residuals = calibration_labels - calibration_predictions
    bias = float(residuals.mean())
    sigma = max(0.35, float(np.sqrt(np.mean((residuals - bias) ** 2))))

    test_predictions = predict(test_indices) + bias
    test_labels = targets[test_indices]
    test_distributions = [
        gaussian_probabilities(float(prediction), 0.0, sigma)
        for prediction in test_predictions
    ]
    query_prediction = float(predict([query_index])[0])
    query_probabilities = gaussian_probabilities(query_prediction, bias, sigma)
    predicted_score = SCORE_VALUES[max(range(len(query_probabilities)), key=query_probabilities.__getitem__)]
    test_mae = mean_absolute_error(test_labels.tolist(), test_predictions.tolist())
    test_within_one = sum(
        abs(label - prediction) <= 1
        for label, prediction in zip(test_labels.tolist(), test_predictions.tolist())
    ) / len(test_labels)

    return {
        "model": MODEL_ID,
        "method": "Frozen BERT mean-pooled embeddings + Ridge(alpha=1) + Gaussian residual calibration",
        "predictedScore": predicted_score,
        "estimatedConfidence": query_probabilities[predicted_score - 1],
        "probabilities": [
            {"score": score, "probability": probability}
            for score, probability in zip(SCORE_VALUES, query_probabilities)
        ],
        "syntheticEvaluation": {
            "trainCount": len(train_indices),
            "calibrationCount": len(calibration_indices),
            "testCount": len(test_indices),
            "testMae": test_mae,
            "testWithinOne": test_within_one,
            "testBrierScore": brier_score(test_labels.tolist(), test_distributions),
            "testEce": expected_calibration_error(test_labels.tolist(), test_distributions),
            "note": (
                "Synthetic-only, small-sample experiment; metrics and probabilities "
                "are not valid for real respondents."
            ),
        },
    }


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
        raise SystemExit(0)
    try:
        request_payload = json.load(sys.stdin)
        result = run_experiment(request_payload)
        print(json.dumps(result, allow_nan=False))
    except ImportError:
        print(json.dumps({
            "error": (
                "Python ML dependencies are missing. Run "
                "`python -m pip install -r server/tpb/requirements.txt`."
            )
        }))
        raise SystemExit(2)
    except Exception as error:
        print(json.dumps({
            "error": (
                "The local BERT experiment failed. Verify Python dependencies, "
                "Hugging Face model access, and available system memory."
            )
        }))
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        raise SystemExit(1)
