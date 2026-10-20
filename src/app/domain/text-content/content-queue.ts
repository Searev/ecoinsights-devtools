import { ContentAnalyser } from "../models/content-analyser";
import { ContentJob, ContentOutcome, ContentState, contentKey } from "../models/text-content";
import { WorkQueue, createWorkQueue } from "../work-queue/work-queue";

/**
 * Schedules the content analyses of one analysis (ARCH-DECISION-018): one entry per URL, one
 * `analyse()` in flight at a time, FIFO order. Same semantics as the estimation queue.
 */
export type ContentQueue = WorkQueue<ContentJob, ContentState>;

export function createContentQueue(analyser: ContentAnalyser): ContentQueue {
  return createWorkQueue<ContentJob, ContentOutcome>({
    keyOf: contentKey,
    run: (job) => analyser.analyse(job),
    onRunError: (error) => ({
      status: "not-evaluated",
      reason: "analysis-failed",
      message: error instanceof Error ? error.message : String(error),
    }),
    stoppedOutcome: { status: "not-evaluated", reason: "analysis-stopped" },
    cancel: () => analyser.cancel?.(),
  });
}
