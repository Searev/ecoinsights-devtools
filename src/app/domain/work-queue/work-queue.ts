import { Closeable } from "../models/closeable";

/**
 * Generic work queue behind the image estimations (ARCH-DECISION-007) and the text content
 * analyses (ARCH-DECISION-018): one entry per job key, one job in flight at a time, FIFO order.
 */
export interface WorkQueue<J, S> {
  /** Enqueues the jobs whose key is unknown (cache by key); known keys are ignored. Never notifies synchronously. */
  request(jobs: readonly J[]): void;
  /** Current state of a job; undefined if never requested. */
  lookup(job: J): S | undefined;
  /** Called after each state change (one call per settled job, one call for stop()). */
  onChange(listener: () => void): Closeable;
  /** Jobs queued or in flight. */
  pendingCount(): number;
  /** Every pending job gets `stoppedOutcome`; queue dropped; late results ignored; `cancel()` called. Idempotent. */
  stop(): void;
}

export interface WorkQueueOptions<J, O> {
  keyOf(job: J): string;
  /** Runs one job. May reject or throw: the error goes through `onRunError`. */
  run(job: J): Promise<O>;
  onRunError(error: unknown): O;
  /** Outcome of the jobs still pending when the queue is stopped. */
  stoppedOutcome: O;
  /** Called once by `stop()`, to abort the work in progress. */
  cancel?(): void;
}

export function createWorkQueue<J, O>(
  options: WorkQueueOptions<J, O>
): WorkQueue<J, { status: "pending" } | O> {
  type State = { status: "pending" } | O;
  const states = new Map<string, State>();
  const waiting: { key: string; job: J }[] = [];
  const listeners = new Set<() => void>();
  let inFlight: string | undefined;
  let stopped = false;

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  const settle = (key: string, outcome: O) => {
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
    let promise: Promise<O>;
    try {
      promise = options.run(next.job);
    } catch (error) {
      promise = Promise.reject(error);
    }
    promise.then(
      (outcome) => settle(next.key, outcome),
      (error) => settle(next.key, options.onRunError(error))
    );
  };

  return {
    request(jobs) {
      if (stopped) return;
      for (const job of jobs) {
        const key = options.keyOf(job);
        if (states.has(key)) continue;
        states.set(key, { status: "pending" });
        waiting.push({ key, job });
      }
      pump();
    },

    lookup: (job) => states.get(options.keyOf(job)),

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
        if ((state as { status: string }).status === "pending") {
          states.set(key, options.stoppedOutcome);
        }
      }
      options.cancel?.();
      notify();
    },
  };
}
