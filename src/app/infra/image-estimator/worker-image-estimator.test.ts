import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EstimationJob, EstimationOutcome } from "../../domain/models/image-estimation";
import { ImageFileInfo } from "../../domain/models/image-variants";
import { CodecFileResult, CodecRequest, CodecResponse, WorkerLike } from "../image-codec/worker-protocol";
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
  replyFile(id: number, result: CodecFileResult) {
    const data: CodecResponse = { type: "file", id, result };
    this.onmessage?.({ data });
  }
}

const INFO: ImageFileInfo = { format: "jpeg", width: 10, height: 8, byteLength: 4, mimeType: "image/jpeg" };

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
    expect(a.type === "estimate" && a.job.url).toBe("https://x.test/1.jpg");
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

  describe("ImageVariantGenerator", () => {
    const binary = (bytes: number[]) => new Uint8Array(bytes).buffer;

    it("loadOriginal returns original-unavailable when the bytes cannot be obtained, without posting", async () => {
      const { estimator, createWorker } = setup({
        getBytes: async () => ({ ok: false, outcome: { status: "failed", reason: "bytes-unavailable", message: "HTTP 404" } }),
      });
      expect(await estimator.loadOriginal("https://x.test/a.jpg", "image/jpeg")).toEqual({
        status: "error",
        error: "original-unavailable",
        message: "HTTP 404",
      });
      expect(createWorker).not.toHaveBeenCalled();
    });

    it("loadOriginal posts inspect (binary transferred) and resolves loaded with the bytes and info", async () => {
      const buffer = binary([1, 2, 3, 4]);
      const { estimator, workers } = setup({ getBytes: async () => ({ ok: true, source: { kind: "binary", data: buffer } }) });
      const p = estimator.loadOriginal("https://x.test/a.jpg", "image/jpeg");
      await vi.advanceTimersByTimeAsync(0);
      const { message, transfer } = workers[0].posted[0];
      expect(message).toMatchObject({ type: "inspect", declaredType: "image/jpeg", source: { kind: "binary", data: buffer } });
      expect(transfer).toEqual([buffer]);
      workers[0].replyFile(message.id, { ok: true, bytes: binary([9, 8, 7, 6]), info: INFO });
      const result = await p;
      expect(result.status).toBe("loaded");
      if (result.status === "loaded") {
        expect(Array.from(result.bytes)).toEqual([9, 8, 7, 6]);
        expect(result.info).toEqual(INFO);
      }
    });

    it("loadOriginal posts a base64 source as is", async () => {
      const { estimator, workers } = setup();
      void estimator.loadOriginal("https://x.test/a.jpg", "image/jpeg");
      await vi.advanceTimersByTimeAsync(0);
      expect(workers[0].posted[0].message).toMatchObject({ type: "inspect", source: { kind: "base64", data: "AAAA" } });
      expect(workers[0].posted[0].transfer ?? []).toEqual([]);
    });

    it("loadOriginal maps an ok:false answer to original-unavailable", async () => {
      const { estimator, workers } = setup();
      const p = estimator.loadOriginal("https://x.test/a.jpg", "image/jpeg");
      await vi.advanceTimersByTimeAsync(0);
      workers[0].replyFile(workers[0].posted[0].message.id, { ok: false, reason: "not-an-image" });
      expect(await p).toMatchObject({ status: "error", error: "original-unavailable" });
    });

    it("generate posts a transferred COPY of the caller's bytes and resolves loaded", async () => {
      const { estimator, workers } = setup();
      const original = new Uint8Array([5, 6, 7]);
      const p = estimator.generate(job(), original);
      await vi.advanceTimersByTimeAsync(0);
      const { message, transfer } = workers[0].posted[0];
      expect(message.type).toBe("generate");
      if (message.type !== "generate" || message.source.kind !== "binary") throw new Error("expected binary generate");
      expect(message.job).toEqual(job());
      expect(message.source.data).not.toBe(original.buffer);
      expect(Array.from(new Uint8Array(message.source.data))).toEqual([5, 6, 7]);
      expect(transfer).toEqual([message.source.data]);
      expect(Array.from(original)).toEqual([5, 6, 7]);
      workers[0].replyFile(message.id, { ok: true, bytes: binary([1]), info: INFO });
      expect(await p).toMatchObject({ status: "loaded", info: INFO });
    });

    it("generate copies only the view when the bytes are a subarray of a larger buffer", async () => {
      const { estimator, workers } = setup();
      const big = new Uint8Array([0, 1, 2, 3, 4, 5]);
      void estimator.generate(job(), big.subarray(2, 4));
      await vi.advanceTimersByTimeAsync(0);
      const message = workers[0].posted[0].message;
      if (message.type !== "generate" || message.source.kind !== "binary") throw new Error("expected binary generate");
      expect(Array.from(new Uint8Array(message.source.data))).toEqual([2, 3]);
    });

    it("generate maps ok:false to generation-failed with the message", async () => {
      const { estimator, workers } = setup();
      const p = estimator.generate(job(), new Uint8Array([1]));
      await vi.advanceTimersByTimeAsync(0);
      workers[0].replyFile(workers[0].posted[0].message.id, { ok: false, reason: "encode-failed", message: "boom" });
      expect(await p).toEqual({ status: "error", error: "generation-failed", message: "boom" });
    });

    it("answers an estimation and a generation in flight independently, out of order", async () => {
      const { estimator, workers } = setup();
      const estimation = estimator.estimate(job("https://x.test/1.jpg"));
      const generation = estimator.generate(job("https://x.test/2.jpg"), new Uint8Array([1]));
      await vi.advanceTimersByTimeAsync(0);
      expect(workers).toHaveLength(1);
      const [a, b] = workers[0].posted.map((p) => p.message);
      expect(a.id).not.toBe(b.id);
      const generateMessage = [a, b].find((m) => m.type === "generate")!;
      const estimateMessage = [a, b].find((m) => m.type === "estimate")!;
      workers[0].replyFile(generateMessage.id, { ok: true, bytes: binary([1, 1]), info: INFO });
      expect(await generation).toMatchObject({ status: "loaded" });
      workers[0].reply(estimateMessage.id, estimated);
      expect(await estimation).toEqual(estimated);
    });

    it("ignores a file response sent for an estimation id and a result response for a generation id", async () => {
      const { estimator, workers } = setup();
      const p = estimator.generate(job(), new Uint8Array([1]));
      await vi.advanceTimersByTimeAsync(0);
      const id = workers[0].posted[0].message.id;
      workers[0].reply(id, estimated);
      workers[0].replyFile(id, { ok: true, bytes: binary([1]), info: INFO });
      expect(await p).toMatchObject({ status: "loaded" });
    });

    it("a generation timeout gives generation-failed and recycles the worker", async () => {
      const { estimator, workers, createWorker } = setup({ timeoutMs: 1000 });
      const p = estimator.generate(job(), new Uint8Array([1]));
      await vi.advanceTimersByTimeAsync(1000);
      expect(await p).toMatchObject({ status: "error", error: "generation-failed" });
      expect(workers[0].terminated).toBe(true);
      void estimator.estimate(job());
      await vi.advanceTimersByTimeAsync(0);
      expect(createWorker).toHaveBeenCalledTimes(2);
    });

    it("an inspect timeout gives original-unavailable", async () => {
      const { estimator } = setup({ timeoutMs: 1000 });
      const p = estimator.loadOriginal("https://x.test/a.jpg", "image/jpeg");
      await vi.advanceTimersByTimeAsync(1000);
      expect(await p).toMatchObject({ status: "error", error: "original-unavailable" });
    });

    it("worker onerror settles dialog requests with errors", async () => {
      const { estimator, workers } = setup();
      const original = estimator.loadOriginal("https://x.test/a.jpg", "image/jpeg");
      const generation = estimator.generate(job(), new Uint8Array([1]));
      await vi.advanceTimersByTimeAsync(0);
      workers[0].onerror?.({ message: "wasm exploded" });
      expect(await original).toMatchObject({ status: "error", error: "original-unavailable" });
      expect(await generation).toMatchObject({ status: "error", error: "generation-failed" });
      expect(workers[0].terminated).toBe(true);
    });

    it("cancel() settles dialog requests with errors, including one still waiting for its bytes", async () => {
      let release!: (r: ImageBytesResult) => void;
      let calls = 0;
      const { estimator, workers, createWorker } = setup({
        getBytes: () => {
          calls++;
          return calls === 1
            ? Promise.resolve({ ok: true, source: { kind: "base64", data: "AAAA" } })
            : new Promise((resolve) => (release = resolve));
        },
      });
      const posted = estimator.loadOriginal("https://x.test/a.jpg", "image/jpeg");
      const generation = estimator.generate(job(), new Uint8Array([1]));
      await vi.advanceTimersByTimeAsync(0);
      const waiting = estimator.loadOriginal("https://x.test/b.jpg", "image/jpeg");
      estimator.cancel();
      expect(workers[0].terminated).toBe(true);
      expect(await posted).toMatchObject({ status: "error", error: "original-unavailable" });
      expect(await generation).toMatchObject({ status: "error", error: "generation-failed" });
      expect(await waiting).toMatchObject({ status: "error", error: "original-unavailable" });
      release({ ok: true, source: { kind: "base64", data: "AAAA" } });
      await vi.advanceTimersByTimeAsync(0);
      expect(createWorker).toHaveBeenCalledTimes(1);
    });

    it("never rejects when the worker cannot be created", async () => {
      const estimator = new WorkerImageEstimator({
        getBytes: async () => ({ ok: true, source: { kind: "base64", data: "AAAA" } }),
        createWorker: () => {
          throw new Error("no worker");
        },
      });
      expect(await estimator.generate(job(), new Uint8Array([1]))).toMatchObject({ status: "error", error: "generation-failed" });
      expect(await estimator.loadOriginal("u", "")).toMatchObject({ status: "error", error: "original-unavailable" });
    });
  });
});
