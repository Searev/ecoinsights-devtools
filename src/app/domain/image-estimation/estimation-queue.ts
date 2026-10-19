import { Closeable } from "../models/closeable";
import {
  EstimateLookup,
  EstimateState,
  EstimationJob,
  EstimationOutcome,
  estimationKey,
} from "../models/image-estimation";
import { ImageEstimator } from "../models/image-estimator";

/**
 * Schedules the estimations of one analysis (ARCH-DECISION-007): one entry per job key,
 * one `estimate()` in flight at a time, FIFO order.
 */
export interface EstimationQueue {
  /** Enqueues the jobs whose key is unknown (cache by estimationKey); known keys are ignored. Never notifies synchronously. */
  request(jobs: readonly EstimationJob[]): void;
  /** Current state of a job; undefined if never requested. */
  lookup: EstimateLookup;
  /** Called after each state change (one call per settled job, one call for stop()). */
  onChange(listener: () => void): Closeable;
  /** Jobs queued or in flight. */
  pendingCount(): number;
  /** Every pending job becomes skipped("analysis-stopped"); queue dropped; late results ignored; estimator.cancel?.() called. Idempotent. */
  stop(): void;
}

const STOPPED: EstimationOutcome = { status: "skipped", reason: "analysis-stopped" };

export function createEstimationQueue(estimator: ImageEstimator): EstimationQueue {
  const states = new Map<string, EstimateState>();
  const waiting: { key: string; job: EstimationJob }[] = [];
  const listeners = new Set<() => void>();
  let inFlight: string | undefined;
  let stopped = false;

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  const settle = (key: string, outcome: EstimationOutcome) => {
    if (stopped || inFlight !== key) return; // Late result after stop().
    inFlight = undefined;
    states.set(key, outcome);
    notify();
    pump();
  };

  const pump = () => {
    if (stopped || inFlight !== undefined) return;
    const next = waiting.shift();
    if (next === undefined) return;
    inFlight = next.key;
    let promise: Promise<EstimationOutcome>;
    try {
      promise = estimator.estimate(next.job);
    } catch (error) {
      promise = Promise.reject(error);
    }
    promise.then(
      (outcome) => settle(next.key, outcome),
      (error) =>
        settle(next.key, {
          status: "failed",
          reason: "encode-failed",
          message: error instanceof Error ? error.message : String(error),
        })
    );
  };

  return {
    request(jobs) {
      if (stopped) return;
      for (const job of jobs) {
        const key = estimationKey(job);
        if (states.has(key)) continue;
        states.set(key, { status: "pending" });
        waiting.push({ key, job });
      }
      pump();
    },

    lookup: (job) => states.get(estimationKey(job)),

    onChange(listener) {
      listeners.add(listener);
      return { close: () => void listeners.delete(listener) };
    },

    pendingCount: () => waiting.length + (inFlight === undefined ? 0 : 1),

    stop() {
      if (stopped) return;
      stopped = true;
      waiting.length = 0;
      inFlight = undefined;
      for (const [key, state] of states) {
        if (state.status === "pending") states.set(key, STOPPED);
      }
      estimator.cancel?.();
      notify();
    },
  };
}
