import argparse
import json
import math
import sys


def emit(payload):
    print(json.dumps(payload, allow_nan=False), flush=True)


def load_model(artifact_path):
    import joblib
    import numpy as np
    import torch
    from transformers import AutoModel, AutoTokenizer

    bundle = joblib.load(artifact_path)
    model_id = bundle.get("model_id")
    ridge_head = bundle.get("ridge_head")
    if not isinstance(model_id, str) or not hasattr(ridge_head, "predict"):
        raise ValueError("The TPB scoring artifact is invalid.")

    torch.set_num_threads(2)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    encoder = AutoModel.from_pretrained(model_id)
    encoder.to(device)
    encoder.eval()
    return tokenizer, encoder, ridge_head, torch, np, device


def score_answer(request, resources):
    tokenizer, encoder, ridge_head, torch, np, device = resources
    request_id = request.get("id")
    question = request.get("question")
    response = request.get("response")
    if not isinstance(request_id, str) or not request_id:
        raise ValueError("The inference request ID is invalid.")
    if not isinstance(question, str) or not question.strip() or len(question) > 2000:
        raise ValueError("The TPB question is invalid.")
    if not isinstance(response, str) or not response.strip() or len(response) > 1000:
        raise ValueError("The TPB answer is invalid.")

    batch = tokenizer(
        [f"Question: {question.strip()} Answer: {response.strip()}"],
        padding=True,
        truncation=True,
        max_length=128,
        return_tensors="pt",
    ).to(device)
    with torch.inference_mode():
        hidden = encoder(**batch).last_hidden_state
        mask = batch["attention_mask"].unsqueeze(-1).to(hidden.dtype)
        pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)
    prediction = float(ridge_head.predict(pooled.cpu().numpy().astype(np.float64))[0])
    if not math.isfinite(prediction):
        raise ValueError("The TPB scoring model returned a non-finite rating.")
    return {"id": request_id, "rating": float(np.clip(prediction, 1.0, 7.0))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", required=True)
    args = parser.parse_args()

    try:
        resources = load_model(args.artifact)
    except Exception as error:
        print(f"TPB model initialization failed: {type(error).__name__}", file=sys.stderr, flush=True)
        emit({"ready": False, "error": "The experimental TPB scoring model could not be loaded."})
        return 1

    emit({"ready": True})
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            result = score_answer(request, resources)
            emit(result)
        except Exception as error:
            request_id = request.get("id") if isinstance(request, dict) else None
            print(f"TPB inference failed: {type(error).__name__}", file=sys.stderr, flush=True)
            emit({
                "id": request_id,
                "error": "The experimental TPB score could not be calculated.",
            })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
