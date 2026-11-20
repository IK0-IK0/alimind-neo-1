import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type {
  TpbQ1ExperimentResult,
  TpbScoreReferenceGroup,
} from "../src/features/assessment/tpb-q1-experiment";

type ExperimentInput = {
  response: string;
  groups: readonly TpbScoreReferenceGroup[];
};

const MAX_OUTPUT_LENGTH = 32_000;
const EXPERIMENT_TIMEOUT_MS = 10 * 60 * 1000;

export class TpbExperimentError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "TpbExperimentError";
  }
}

function isExperimentResult(value: unknown): value is TpbQ1ExperimentResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<TpbQ1ExperimentResult>;
  const evaluation = result.syntheticEvaluation;
  return typeof result.model === "string"
    && typeof result.method === "string"
    && Number.isInteger(result.predictedScore)
    && result.predictedScore! >= 1
    && result.predictedScore! <= 7
    && Array.isArray(result.probabilities)
    && result.probabilities.length === 7
    && result.probabilities.every((entry, index) => entry.score === index + 1
      && Number.isFinite(entry.probability)
      && entry.probability >= 0
      && entry.probability <= 1)
    && Number.isFinite(result.estimatedConfidence)
    && result.estimatedConfidence! >= 0
    && result.estimatedConfidence! <= 1
    && Math.abs(result.probabilities.reduce((sum, entry) => sum + entry.probability, 0) - 1) < 1e-5
    && Boolean(evaluation)
    && Number.isInteger(evaluation?.trainCount)
    && Number.isInteger(evaluation?.calibrationCount)
    && Number.isInteger(evaluation?.testCount)
    && Number.isFinite(evaluation?.testMae)
    && Number.isFinite(evaluation?.testWithinOne)
    && Number.isFinite(evaluation?.testBrierScore)
    && Number.isFinite(evaluation?.testEce)
    && typeof evaluation?.note === "string";
}

export function runTpbQ1Experiment(input: ExperimentInput): Promise<TpbQ1ExperimentResult> {
  const python = process.env.PYTHON_EXECUTABLE || "python";
  const script = resolve(import.meta.dirname, "tpb", "bert_q1_experiment.py");
  return new Promise((resolveResult, reject) => {
    const child = spawn(python, [script], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, EXPERIMENT_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length + chunk.length > MAX_OUTPUT_LENGTH) {
        child.kill();
        return;
      }
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-MAX_OUTPUT_LENGTH);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      if ("code" in error && error.code === "ENOENT") {
        reject(new TpbExperimentError(
          "Python was not found. Install Python and the TPB experiment requirements.",
          503,
        ));
        return;
      }
      reject(new TpbExperimentError("Could not start the local BERT experiment.", 503));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new TpbExperimentError("The local BERT experiment timed out. Try again after model setup completes.", 504));
        return;
      }
      if (stdout.length > MAX_OUTPUT_LENGTH) {
        reject(new TpbExperimentError("The local BERT experiment returned too much output.", 502));
        return;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(stdout);
      } catch {
        if (stderr.trim()) console.error("Local TPB experiment failed:", stderr.trim());
        reject(new TpbExperimentError(
          code === 0
            ? "The local BERT experiment returned an invalid response."
            : "BERT dependencies or model files are unavailable. Follow the Python setup instructions and try again.",
          code === 0 ? 502 : 503,
        ));
        return;
      }
      if (code !== 0 || !isExperimentResult(payload)) {
        if (stderr.trim()) console.error("Local TPB experiment failed:", stderr.trim());
        const errorMessage = payload && typeof payload === "object" && "error" in payload
          && typeof payload.error === "string"
          ? payload.error
          : undefined;
        reject(new TpbExperimentError(
          errorMessage ?? (stderr.trim()
            ? "The local BERT experiment failed. Check the Python setup and model download."
            : "The local BERT experiment failed."),
          code === 0 ? 502 : 503,
        ));
        return;
      }
      resolveResult(payload);
    });
    child.stdin.end(JSON.stringify(input));
  });
}
