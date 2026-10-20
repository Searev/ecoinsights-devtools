import { EstimationJob, EstimationOutcome } from "../../domain/models/image-estimation";
import { ImageEstimator } from "../../domain/models/image-estimator";
import { ImageFileResult, ImageVariantGenerator } from "../../domain/models/image-variants";
import {
  CodecFileResult,
  CodecRequest,
  CodecResponse,
  ImageBytes,
  WorkerLike,
} from "../image-codec/worker-protocol";
import { ImageBytesResult, ImageBytesSource } from "./image-bytes-source";

export interface WorkerImageEstimatorDeps {
  getBytes: ImageBytesSource;
  createWorker: () => WorkerLike;
  /** Per-job time limit once posted to the worker. Default 120 000 ms. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/** Why a request ended without an answer from the worker. */
type Failure =
  | { cause: "stopped" }
  | { cause: "timeout" }
  | { cause: "error"; message?: string };

/** Request without its id, as posted to the worker. */
type NewRequest = CodecRequest extends infer R ? (R extends CodecRequest ? Omit<R, "id"> : never) : never;

/** What a kind of request needs to turn worker answers and failures into its own result type. */
interface Handler<T> {
  /** Answer type of the worker, anything else is ignored. */
  answer: CodecResponse["type"];
  fromResponse(data: CodecResponse): T;
  fromFailure(failure: Failure): T;
}

interface Entry {
  /** Settles with a failure (no-op once settled). */
  fail(failure: Failure): void;
  /** Settles with a worker answer of the right type. */
  answer(data: CodecResponse): void;
  expects: CodecResponse["type"];
  timer?: ReturnType<typeof setTimeout>;
  worker?: WorkerLike;
}

const estimation: Handler<EstimationOutcome> = {
  answer: "result",
  fromResponse: (data) => (data.type === "result" ? data.outcome : failed("encode-failed", undefined)),
  fromFailure: (failure) => {
    switch (failure.cause) {
      case "stopped":
        return { status: "skipped", reason: "analysis-stopped" };
      case "timeout":
        return { status: "failed", reason: "timeout" };
      case "error":
        return { status: "failed", reason: "encode-failed", ...(failure.message ? { message: failure.message } : {}) };
    }
  },
};

const fileHandler = (error: "original-unavailable" | "generation-failed"): Handler<ImageFileResult> => ({
  answer: "file",
  fromResponse: (data) => (data.type === "file" ? fromFile(data.result, error) : { status: "error", error }),
  fromFailure: (failure) => ({
    status: "error",
    error,
    ...(failure.cause === "error" && failure.message ? { message: failure.message } : {}),
  }),
});

const inspection = fileHandler("original-unavailable");
const generation = fileHandler("generation-failed");

function fromFile(result: CodecFileResult, error: "original-unavailable" | "generation-failed"): ImageFileResult {
  return result.ok
    ? { status: "loaded", bytes: new Uint8Array(result.bytes), info: result.info }
    : { status: "error", error, ...(result.message ? { message: result.message } : {}) };
}

/**
 * `ImageEstimator` and `ImageVariantGenerator` backed by the codec Web Worker (ARCH-DECISION-009,
 * 012). The worker is created on the first request, recycled after a timeout or an error, and
 * terminated by `cancel()`. Estimations and dialog requests share the worker and the id sequence.
 * Never rejects.
 */
export class WorkerImageEstimator implements ImageEstimator, ImageVariantGenerator {
  private worker: WorkerLike | null = null;
  private nextId = 1;
  /** Requests waiting for their bytes (no id yet) or posted (keyed by id). */
  private active = new Set<Entry>();
  private posted = new Map<number, Entry>();
  /** Incremented by `cancel()`; a request whose bytes arrive after a cancel is dropped. */
  private epoch = 0;

  constructor(private deps: WorkerImageEstimatorDeps) {}

  estimate(job: EstimationJob): Promise<EstimationOutcome> {
    return this.submit(
      estimation,
      () => this.deps.getBytes(job.url),
      (source): NewRequest => ({ type: "estimate", job, source }),
      (outcome) => outcome,
    );
  }

  loadOriginal(url: string, declaredType: string): Promise<ImageFileResult> {
    return this.submit(
      inspection,
      () => this.deps.getBytes(url),
      (source): NewRequest => ({ type: "inspect", declaredType, source }),
      (outcome) => ({
        status: "error",
        error: "original-unavailable",
        ...(outcome.status === "failed" && outcome.message ? { message: outcome.message } : {}),
      }),
    );
  }

  generate(job: EstimationJob, original: Uint8Array): Promise<ImageFileResult> {
    return this.submit(
      generation,
      async () => ({ ok: true, source: { kind: "binary", data: copyOf(original) } }),
      (source): NewRequest => ({ type: "generate", job, source }),
      () => ({ status: "error", error: "generation-failed" }),
    );
  }

  cancel(): void {
    this.epoch++;
    const entries = [...this.active];
    this.terminateWorker();
    entries.forEach((e) => e.fail({ cause: "stopped" }));
  }

  /**
   * One request: obtains its bytes, posts it, and settles with the worker's answer or a failure.
   * `fromBytesFailure` converts a failed byte source into the request's result.
   */
  private submit<T>(
    handler: Handler<T>,
    getBytes: () => Promise<ImageBytesResult>,
    build: (source: ImageBytes) => NewRequest,
    fromBytesFailure: (outcome: EstimationOutcome) => T,
  ): Promise<T> {
    return new Promise<T>((resolve) => {
      const epoch = this.epoch;
      let done = false;
      const settle = (value: T) => {
        if (done) return;
        done = true;
        if (entry.timer !== undefined) clearTimeout(entry.timer);
        this.active.delete(entry);
        resolve(value);
      };
      const entry: Entry = {
        expects: handler.answer,
        fail: (failure) => settle(handler.fromFailure(failure)),
        answer: (data) => settle(handler.fromResponse(data)),
      };
      this.active.add(entry);

      Promise.resolve()
        .then(getBytes)
        .then((bytes) => {
          if (done || epoch !== this.epoch) return entry.fail({ cause: "stopped" });
          if (!bytes.ok) return settle(fromBytesFailure(bytes.outcome));
          this.post(entry, build(bytes.source));
        })
        .catch((e) => settle(fromBytesFailure(failed("bytes-unavailable", e))));
    });
  }

  private post(entry: Entry, message: NewRequest) {
    let worker: WorkerLike;
    try {
      worker = this.ensureWorker();
    } catch (e) {
      return entry.fail({ cause: "error", message: e instanceof Error ? e.message : String(e) });
    }
    const id = this.nextId++;
    entry.worker = worker;
    this.posted.set(id, entry);
    const forget = (fn: () => void) => () => {
      this.posted.delete(id);
      fn();
    };
    const { fail, answer } = entry;
    entry.fail = (failure) => forget(() => fail(failure))();
    entry.answer = (data) => forget(() => answer(data))();
    entry.timer = setTimeout(() => {
      this.recycle(worker, { cause: "timeout" });
    }, this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const request = { ...message, id } as CodecRequest;
    try {
      if (message.source.kind === "binary") worker.postMessage(request, [message.source.data]);
      else worker.postMessage(request);
    } catch (e) {
      entry.fail({ cause: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const worker = this.deps.createWorker();
    worker.onmessage = (event) => {
      if (this.worker !== worker) return;
      const data = event.data;
      if (data?.type !== "result" && data?.type !== "file") return;
      const entry = this.posted.get(data.id);
      if (entry && entry.expects === data.type) entry.answer(data);
    };
    worker.onerror = (event) => {
      if (this.worker !== worker) return;
      const message = (event as { message?: unknown } | null)?.message;
      this.recycle(worker, { cause: "error", ...(typeof message === "string" ? { message } : {}) });
    };
    this.worker = worker;
    return worker;
  }

  /** Terminates `worker` and settles its posted requests with `failure`. */
  private recycle(worker: WorkerLike, failure: Failure) {
    const entries = [...this.posted.values()].filter((e) => e.worker === worker);
    if (this.worker === worker) this.terminateWorker();
    else worker.terminate();
    entries.forEach((e) => e.fail(failure));
  }

  private terminateWorker() {
    const worker = this.worker;
    this.worker = null;
    worker?.terminate();
  }
}

/** A standalone copy of `bytes` (only the view), so that transferring it leaves the caller's bytes intact. */
function copyOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function failed(reason: "bytes-unavailable" | "encode-failed", error: unknown): EstimationOutcome {
  return {
    status: "failed",
    reason,
    ...(error === undefined ? {} : { message: error instanceof Error ? error.message : String(error) }),
  };
}
