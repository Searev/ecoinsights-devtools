import { EstimationJob, EstimationOutcome } from "../../domain/models/image-estimation";
import { ImageEstimator } from "../../domain/models/image-estimator";
import { CodecRequest, WorkerLike } from "../image-codec/worker-protocol";
import { ImageBytesSource } from "./image-bytes-source";

export interface WorkerImageEstimatorDeps {
  getBytes: ImageBytesSource;
  createWorker: () => WorkerLike;
  /** Per-job time limit once posted to the worker. Default 120 000 ms. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

const STOPPED: EstimationOutcome = { status: "skipped", reason: "analysis-stopped" };

interface Entry {
  settle(outcome: EstimationOutcome): void;
  timer?: ReturnType<typeof setTimeout>;
  worker?: WorkerLike;
}

/**
 * `ImageEstimator` backed by the codec Web Worker (ARCH-DECISION-009). The worker is created on
 * the first job, recycled after a timeout or an error, and terminated by `cancel()`. Never rejects.
 */
export class WorkerImageEstimator implements ImageEstimator {
  private worker: WorkerLike | null = null;
  private nextId = 1;
  /** Jobs waiting for their bytes (no id yet) or posted (keyed by id). */
  private active = new Set<Entry>();
  private posted = new Map<number, Entry>();
  /** Incremented by `cancel()`; a job whose bytes arrive after a cancel is dropped. */
  private epoch = 0;

  constructor(private deps: WorkerImageEstimatorDeps) {}

  estimate(job: EstimationJob): Promise<EstimationOutcome> {
    return new Promise<EstimationOutcome>((resolve) => {
      const epoch = this.epoch;
      let done = false;
      const entry: Entry = {
        settle: (outcome) => {
          if (done) return;
          done = true;
          if (entry.timer !== undefined) clearTimeout(entry.timer);
          this.active.delete(entry);
          resolve(outcome);
        },
      };
      this.active.add(entry);

      this.deps
        .getBytes(job.url)
        .then((bytes) => {
          if (done || epoch !== this.epoch) return entry.settle(STOPPED);
          if (!bytes.ok) return entry.settle(bytes.outcome);
          this.post(entry, job, bytes.source);
        })
        .catch((e) => entry.settle(failed("bytes-unavailable", e)));
    });
  }

  cancel(): void {
    this.epoch++;
    const entries = [...this.active];
    this.terminateWorker();
    entries.forEach((e) => e.settle(STOPPED));
  }

  private post(entry: Entry, job: EstimationJob, source: CodecRequest["source"]) {
    let worker: WorkerLike;
    try {
      worker = this.ensureWorker();
    } catch (e) {
      return entry.settle(failed("encode-failed", e));
    }
    const id = this.nextId++;
    entry.worker = worker;
    this.posted.set(id, entry);
    const settle = entry.settle;
    entry.settle = (outcome) => {
      this.posted.delete(id);
      settle(outcome);
    };
    entry.timer = setTimeout(() => {
      this.recycle(worker, { status: "failed", reason: "timeout" });
    }, this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const request: CodecRequest = { type: "estimate", id, job, source };
    try {
      if (source.kind === "binary") worker.postMessage(request, [source.data]);
      else worker.postMessage(request);
    } catch (e) {
      entry.settle(failed("encode-failed", e));
    }
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const worker = this.deps.createWorker();
    worker.onmessage = (event) => {
      if (this.worker !== worker) return;
      const entry = this.posted.get(event.data?.id);
      entry?.settle(event.data.outcome);
    };
    worker.onerror = (event) => {
      if (this.worker !== worker) return;
      const message = (event as { message?: unknown } | null)?.message;
      this.recycle(worker, {
        status: "failed",
        reason: "encode-failed",
        ...(typeof message === "string" ? { message } : {}),
      });
    };
    this.worker = worker;
    return worker;
  }

  /** Terminates `worker` and settles its posted jobs with `outcome`. */
  private recycle(worker: WorkerLike, outcome: EstimationOutcome) {
    const entries = [...this.posted.values()].filter((e) => e.worker === worker);
    if (this.worker === worker) this.terminateWorker();
    else worker.terminate();
    entries.forEach((e) => e.settle(outcome));
  }

  private terminateWorker() {
    const worker = this.worker;
    this.worker = null;
    worker?.terminate();
  }
}

function failed(reason: "bytes-unavailable" | "encode-failed", error: unknown): EstimationOutcome {
  return { status: "failed", reason, message: error instanceof Error ? error.message : String(error) };
}
