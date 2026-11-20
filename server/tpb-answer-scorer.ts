import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

type WorkerReply = {
  ready?: boolean;
  id?: string;
  rating?: number;
  error?: string;
};

type PendingRequest = {
  resolve: (rating: number) => void;
  reject: (error: TpbAnswerScorerError) => void;
  timeout: NodeJS.Timeout;
};

type WorkerState = {
  child: ChildProcessWithoutNullStreams;
  pending: Map<string, PendingRequest>;
  stderr: string;
};

const STARTUP_TIMEOUT_MS = 3 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30 * 1000;
const MAX_PENDING_REQUESTS = 32;

let worker: WorkerState | null = null;
let startingWorker: WorkerState | null = null;
let workerStartup: Promise<WorkerState> | null = null;

export class TpbAnswerScorerError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "TpbAnswerScorerError";
  }
}

function failWorker(
  state: WorkerState,
  error: TpbAnswerScorerError,
  rejectStartup?: (error: TpbAnswerScorerError) => void,
): void {
  if (worker === state) worker = null;
  if (startingWorker === state) startingWorker = null;
  for (const [id, request] of state.pending) {
    clearTimeout(request.timeout);
    request.reject(error);
    state.pending.delete(id);
  }
  if (state.stderr.trim()) {
    console.error("TPB scoring worker failed:", state.stderr.trim());
    state.stderr = "";
  }
  if (rejectStartup) rejectStartup(error);
  if (!state.child.killed && state.child.exitCode === null) state.child.kill();
}

function startWorker(): Promise<WorkerState> {
  const python = process.env.PYTHON_EXECUTABLE || "python";
  const script = resolve(import.meta.dirname, "tpb", "bert_answer_score_worker.py");
  const artifact = resolve(import.meta.dirname, "tpb", "respondent-tpb-ridge-head.joblib");

  return new Promise((resolveWorker, rejectWorker) => {
    const child = spawn(python, [script, "--artifact", artifact], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const state: WorkerState = { child, pending: new Map(), stderr: "" };
    startingWorker = state;
    let startupSettled = false;
    const startupTimeout = setTimeout(() => {
      if (startupSettled) return;
      startupSettled = true;
      clearTimeout(startupTimeout);
      failWorker(
        state,
        new TpbAnswerScorerError("The TPB scoring model took too long to start.", 503),
      );
      rejectWorker(new TpbAnswerScorerError("The TPB scoring model took too long to start.", 503));
    }, STARTUP_TIMEOUT_MS);

    const fail = (error: TpbAnswerScorerError) => {
      if (startingWorker === state) startingWorker = null;
      if (startupSettled) {
        failWorker(state, error);
        return;
      }
      startupSettled = true;
      clearTimeout(startupTimeout);
      failWorker(state, error);
      rejectWorker(error);
    };

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      state.stderr = (state.stderr + chunk).slice(-4000);
    });

    const output = createInterface({ input: child.stdout });
    output.on("line", (line) => {
      let reply: WorkerReply;
      try {
        reply = JSON.parse(line) as WorkerReply;
      } catch {
        fail(new TpbAnswerScorerError("The TPB scoring worker returned an invalid response.", 502));
        return;
      }

      if (!startupSettled) {
        if (reply.ready === true) {
          startupSettled = true;
          clearTimeout(startupTimeout);
          startingWorker = null;
          worker = state;
          resolveWorker(state);
        } else {
          fail(new TpbAnswerScorerError(
            reply.error ?? "The TPB scoring model could not be loaded.",
            503,
          ));
        }
        return;
      }

      if (typeof reply.id !== "string") {
        fail(new TpbAnswerScorerError("The TPB scoring worker returned an invalid response.", 502));
        return;
      }
      const request = state.pending.get(reply.id);
      if (!request) return;
      clearTimeout(request.timeout);
      state.pending.delete(reply.id);

      if (typeof reply.error === "string") {
        request.reject(new TpbAnswerScorerError(reply.error, 503));
        return;
      }
      if (typeof reply.rating !== "number" || !Number.isFinite(reply.rating)
        || reply.rating < 1 || reply.rating > 7) {
        request.reject(new TpbAnswerScorerError("The TPB scoring model returned an invalid rating.", 502));
        return;
      }
      request.resolve(reply.rating);
    });

    child.on("error", (error) => {
      const message = "Could not start the local TPB scoring model.";
      fail(new TpbAnswerScorerError(
        "code" in error && error.code === "ENOENT"
          ? "Python was not found. Install Python and the TPB experiment requirements."
          : message,
        503,
      ));
    });
    child.on("close", () => {
      output.close();
      const error = new TpbAnswerScorerError("The TPB scoring worker stopped unexpectedly.", 503);
      if (!startupSettled) fail(error);
      else failWorker(state, error);
    });
  });
}

function getWorker(): Promise<WorkerState> {
  if (worker && worker.child.exitCode === null) return Promise.resolve(worker);
  if (workerStartup) return workerStartup;
  workerStartup = startWorker().finally(() => {
    workerStartup = null;
  });
  return workerStartup;
}

export async function scoreTpbAnswer(question: string, response: string): Promise<number> {
  if (!question.trim() || question.length > 2000 || !response.trim() || response.length > 1000) {
    throw new TpbAnswerScorerError("The TPB question or answer is invalid.", 400);
  }
  const state = await getWorker();
  if (state.pending.size >= MAX_PENDING_REQUESTS) {
    throw new TpbAnswerScorerError("The TPB scoring service is busy. Please try again.", 503);
  }

  const id = randomUUID();
  return new Promise((resolveRating, rejectRating) => {
    const timeout = setTimeout(() => {
      state.pending.delete(id);
      rejectRating(new TpbAnswerScorerError("The TPB score could not be calculated in time.", 504));
    }, REQUEST_TIMEOUT_MS);
    state.pending.set(id, {
      resolve: resolveRating,
      reject: rejectRating,
      timeout,
    });
    state.child.stdin.write(
      `${JSON.stringify({ id, question, response })}\n`,
      (error?: Error | null) => {
        if (!error) return;
        const request = state.pending.get(id);
        if (!request) return;
        clearTimeout(request.timeout);
        state.pending.delete(id);
        request.reject(new TpbAnswerScorerError("The TPB score could not be sent to the model.", 503));
      },
    );
  });
}

export function stopTpbAnswerScorer(): void {
  if (worker) {
    const state = worker;
    worker = null;
    failWorker(state, new TpbAnswerScorerError("The TPB scoring worker is shutting down.", 503));
    return;
  }
  if (startingWorker && startingWorker.child.exitCode === null) {
    startingWorker.child.kill();
  }
}
