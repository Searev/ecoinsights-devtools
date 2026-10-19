import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EstimationJob, EstimationOutcome } from "../../domain/models/image-estimation";
import { CodecRequest, CodecResponse, WorkerLike } from "../image-codec/worker-protocol";
import { ImageBytesResult } from "./image-bytes-source";
import { WorkerImageEstimator } from "./worker-image-estimator";

class FakeWorker implements WorkerLike {
  posted: Array<{ message: CodecRequest; transfer?: Transferable[] }> = [];
  terminated = false;
  onmessage: WorkerLike["onmessage"] = null;
  onerror: WorkerLike["onerror"] = null;
  postMessage(message: CodecRequest, transfer?: Transferable[]) {
    this.posted.push({ message, transfer });
  }
  terminate() {
    this.terminated = true;
  }
  reply(id: number, outcome: EstimationOutcome) {
    const data: CodecResponse = { type: "result", id, outcome };
    this.onmessage?.({ data });
  }
}

const job = (url = "https://x.test/a.jpg"): EstimationJob => ({
  url,
  declaredType: "image/jpeg",
  transform: { kind: "convert" },
});

const estimated: EstimationOutcome = {
  status: "estimated",
  sourceFormat: "jpeg",
  target: { format: "avif", quality: 65, speed: 6 },
  sourceBytes: 100,
  encodedBytes: 40,
  width: 10,
  height: 10,
};


function setup(opts: { getBytes?: (url: string) => Promise<ImageBytesResult>; timeoutMs?: number } = {}) {
  const workers: FakeWorker[] = [];
  const getBytes =
    opts.getBytes ??
    (async (): Promise<ImageBytesResult> => ({ ok: true, source: { kind: "base64", data: "AAAA" } }));
  const createWorker = vi.fn(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  const estimator = new WorkerImageEstimator({ getBytes, createWorker, timeoutMs: opts.timeoutMs });
  return { estimator, workers, createWorker };
}

describe("WorkerImageEstimator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates the worker lazily on the first job and matches responses by id", async () => {
    const { estimator, workers, createWorker } = setup();
    expect(createWorker).not.toHaveBeenCalled();
    const p1 = estimator.estimate(job("https://x.test/1.jpg"));
    const p2 = estimator.estimate(job("https://x.test/2.jpg"));
    await vi.advanceTimersByTimeAsync(0);
    expect(createWorker).toHaveBeenCalledTimes(1);
    const [a, b] = workers[0].posted.map((p) => p.message);
    expect(a.id).not.toBe(b.id);
    expect(a.type).toBe("estimate");
    expect(a.job.url).toBe("https://x.test/1.jpg");
    // answer out of order
    const other: EstimationOutcome = { status: "skipped", reason: "animated" };
    workers[0].reply(b.id, other);
    workers[0].reply(a.id, estimated);
    expect(await p1).toEqual(estimated);
    expect(await p2).toEqual(other);
  });

  it("transfers the ArrayBuffer of binary sources", async () => {
    const buffer = new ArrayBuffer(8);
    const { estimator, workers } = setup({
      getBytes: async () => ({ ok: true, source: { kind: "binary", data: buffer } }),
    });
    void estimator.estimate(job());
    await vi.advanceTimersByTimeAsync(0);
    expect(workers[0].posted[0].transfer).toEqual([buffer]);
    expect(workers[0].posted[0].message.source).toEqual({ kind: "binary", data: buffer });
  });

  it("does not transfer base64 sources", async () => {
    const { estimator, workers } = setup();
    void estimator.estimate(job());
    await vi.advanceTimersByTimeAsync(0);
    expect(workers[0].posted[0].transfer ?? []).toEqual([]);
  });

  it("returns the getBytes failure without creating a worker or posting", async () => {
    const outcome: EstimationOutcome = { status: "failed", reason: "bytes-unavailable" };
    const { estimator, createWorker } = setup({ getBytes: async () => ({ ok: false, outcome }) });
    expect(await estimator.estimate(job())).toEqual(outcome);
    expect(createWorker).not.toHaveBeenCalled();
  });

  it("times out with failed(timeout), terminates the worker and recreates one for the next job", async () => {
    const { estimator, workers, createWorker } = setup({ timeoutMs: 1000 });
    const p = estimator.estimate(job());
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toMatchObject({ status: "failed", reason: "timeout" });
    expect(workers[0].terminated).toBe(true);

    const p2 = estimator.estimate(job("https://x.test/2.jpg"));
    await vi.advanceTimersByTimeAsync(0);
    expect(createWorker).toHaveBeenCalledTimes(2);
    workers[1].reply(workers[1].posted[0].message.id, estimated);
    expect(await p2).toEqual(estimated);
  });

  it("does not time out once the answer arrived", async () => {
    const { estimator, workers } = setup({ timeoutMs: 1000 });
    const p = estimator.estimate(job());
    await vi.advanceTimersByTimeAsync(0);
    workers[0].reply(workers[0].posted[0].message.id, estimated);
    expect(await p).toEqual(estimated);
    await vi.advanceTimersByTimeAsync(5000);
    expect(workers[0].terminated).toBe(false);
  });

  it("worker onerror settles every in-flight job with failed(encode-failed) and recycles the worker", async () => {
    const { estimator, workers, createWorker } = setup();
    const p1 = estimator.estimate(job("https://x.test/1.jpg"));
    const p2 = estimator.estimate(job("https://x.test/2.jpg"));
    await vi.advanceTimersByTimeAsync(0);
    workers[0].onerror?.({ message: "wasm exploded" });
    expect(await p1).toMatchObject({ status: "failed", reason: "encode-failed", message: "wasm exploded" });
    expect(await p2).toMatchObject({ status: "failed", reason: "encode-failed" });
    expect(workers[0].terminated).toBe(true);
    void estimator.estimate(job("https://x.test/3.jpg"));
    await vi.advanceTimersByTimeAsync(0);
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it("cancel() terminates the worker and settles in-flight jobs with skipped(analysis-stopped)", async () => {
    const { estimator, workers } = setup();
    const p = estimator.estimate(job());
    await vi.advanceTimersByTimeAsync(0);
    estimator.cancel();
    expect(workers[0].terminated).toBe(true);
    expect(await p).toEqual({ status: "skipped", reason: "analysis-stopped" });
  });

  it("cancel() settles a job still waiting for its bytes without posting", async () => {
    let release!: (r: ImageBytesResult) => void;
    const { estimator, workers, createWorker } = setup({
      getBytes: () => new Promise((resolve) => (release = resolve)),
    });
    const p = estimator.estimate(job());
    estimator.cancel();
    expect(await p).toEqual({ status: "skipped", reason: "analysis-stopped" });
    release({ ok: true, source: { kind: "base64", data: "AAAA" } });
    await vi.advanceTimersByTimeAsync(0);
    expect(createWorker).not.toHaveBeenCalled();
    expect(workers).toHaveLength(0);
  });

  it("cancel() without a worker is a no-op and later jobs still work", async () => {
    const { estimator, workers } = setup();
    estimator.cancel();
    const p = estimator.estimate(job());
    await vi.advanceTimersByTimeAsync(0);
    workers[0].reply(workers[0].posted[0].message.id, estimated);
    expect(await p).toEqual(estimated);
  });

  it("ignores a late response of an unknown id", async () => {
    const { estimator, workers } = setup();
    const p = estimator.estimate(job());
    await vi.advanceTimersByTimeAsync(0);
    workers[0].reply(999, estimated);
    workers[0].reply(workers[0].posted[0].message.id, { status: "skipped", reason: "animated" });
    expect(await p).toEqual({ status: "skipped", reason: "animated" });
  });
});
