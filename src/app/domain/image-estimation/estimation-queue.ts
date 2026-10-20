import { Closeable } from "../models/closeable";
import {
  EstimateLookup,
  EstimationJob,
  EstimationOutcome,
  estimationKey,
} from "../models/image-estimation";
import { ImageEstimator } from "../models/image-estimator";
import { createWorkQueue } from "../work-queue/work-queue";

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
  return createWorkQueue<EstimationJob, EstimationOutcome>({
    keyOf: estimationKey,
    run: (job) => estimator.estimate(job),
    onRunError: (error) => ({
      status: "failed",
      reason: "encode-failed",
      message: error instanceof Error ? error.message : String(error),
    }),
    stoppedOutcome: STOPPED,
    cancel: () => estimator.cancel?.(),
  });
}
