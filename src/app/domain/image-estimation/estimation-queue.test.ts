import { describe, expect, it, vi } from "vitest";
import { EstimationJob, EstimationOutcome } from "../models/image-estimation";
import { ImageEstimator } from "../models/image-estimator";
import { createEstimationQueue } from "./estimation-queue";

interface Deferred {
  job: EstimationJob;
  resolve: (outcome: EstimationOutcome) => void;
  reject: (error: unknown) => void;
}

/** Hand-written estimator: every call waits for a manual resolution. */
class FakeEstimator implements ImageEstimator {
  calls: Deferred[] = [];
  inFlight = 0;
  maxInFlight = 0;
  cancelCalls = 0;

  estimate(job: EstimationJob): Promise<EstimationOutcome> {
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    return new Promise<EstimationOutcome>((resolve, reject) => {
      this.calls.push({
        job,
        resolve: (outcome) => {
          this.inFlight--;
          resolve(outcome);
        },
        reject: (error) => {
          this.inFlight--;
          reject(error);
        },
      });
    });
  }

  cancel(): void {
    this.cancelCalls++;
  }
}

const resize = (url: string, width = 600, height = 400): EstimationJob => ({
  url,
  declaredType: "image/jpeg",
  transform: { kind: "resize", width, height },
});

const convert = (url: string): EstimationJob => ({
  url,
  declaredType: "image/jpeg",
  transform: { kind: "convert" },
});

const estimated = (encodedBytes: number): EstimationOutcome => ({
  status: "estimated",
  sourceFormat: "jpeg",
  target: { format: "jpeg", quality: 80 },
  sourceBytes: 240_000,
  encodedBytes,
  width: 1200,
  height: 800,
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("EstimationQueue", () => {
  it("encodes once per key however many times the same job is requested", async () => {
    const estimator = new FakeEstimator();
    const queue = createEstimationQueue(estimator);

    queue.request([resize("https://a.test/1.jpg")]);
    queue.request([resize("https://a.test/1.jpg"), resize("https://a.test/1.jpg")]);
    estimator.calls[0].resolve(estimated(60_000));
    await flush();
    queue.request([resize("https://a.test/1.jpg")]);
    await flush();

    expect(estimator.calls).toHaveLength(1);
    expect(queue.lookup(resize("https://a.test/1.jpg"))).toEqual(estimated(60_000));
  });

  it("keeps different transformations of one URL as distinct entries", async () => {
    const estimator = new FakeEstimator();
    const queue = createEstimationQueue(estimator);

    queue.request([
      resize("https://a.test/1.jpg", 600, 400),
      resize("https://a.test/1.jpg", 300, 200),
      convert("https://a.test/1.jpg"),
    ]);
    estimator.calls[0].resolve(estimated(60_000));
    await flush();
    estimator.calls[1].resolve(estimated(30_000));
    await flush();
    estimator.calls[2].resolve(estimated(20_000));
    await flush();

    expect(estimator.calls).toHaveLength(3);
    expect(queue.lookup(resize("https://a.test/1.jpg", 600, 400))).toEqual(estimated(60_000));
    expect(queue.lookup(resize("https://a.test/1.jpg", 300, 200))).toEqual(estimated(30_000));
    expect(queue.lookup(convert("https://a.test/1.jpg"))).toEqual(estimated(20_000));
  });

  it("runs jobs in FIFO order with a single estimate() in flight", async () => {
    const estimator = new FakeEstimator();
    const queue = createEstimationQueue(estimator);

    queue.request([resize("https://a.test/1.jpg"), resize("https://a.test/2.jpg")]);
    queue.request([resize("https://a.test/3.jpg")]);

    expect(estimator.calls.map((c) => c.job.url)).toEqual(["https://a.test/1.jpg"]);
    expect(queue.pendingCount()).toBe(3);

    estimator.calls[0].resolve(estimated(1));
    await flush();
    expect(estimator.calls.map((c) => c.job.url)).toEqual([
      "https://a.test/1.jpg",
      "https://a.test/2.jpg",
    ]);

    estimator.calls[1].resolve(estimated(2));
    await flush();
    estimator.calls[2].resolve(estimated(3));
    await flush();

    expect(estimator.calls.map((c) => c.job.url)).toEqual([
      "https://a.test/1.jpg",
      "https://a.test/2.jpg",
      "https://a.test/3.jpg",
    ]);
    expect(estimator.maxInFlight).toBe(1);
    expect(queue.pendingCount()).toBe(0);
  });

  it("looks up pending, then the outcome, and undefined for unknown jobs", async () => {
    const estimator = new FakeEstimator();
    const queue = createEstimationQueue(estimator);
    const job = resize("https://a.test/1.jpg");

    expect(queue.lookup(job)).toBeUndefined();
    queue.request([job]);
    expect(queue.lookup(job)).toEqual({ status: "pending" });

    estimator.calls[0].resolve(estimated(60_000));
    await flush();

    expect(queue.lookup(job)).toEqual(estimated(60_000));
    expect(queue.lookup(resize("https://a.test/other.jpg"))).toBeUndefined();
  });

  it("notifies once per settled job and never synchronously from request()", async () => {
    const estimator = new FakeEstimator();
    const queue = createEstimationQueue(estimator);
    const listener = vi.fn();
    queue.onChange(listener);

    queue.request([resize("https://a.test/1.jpg"), resize("https://a.test/2.jpg")]);
    expect(listener).not.toHaveBeenCalled();

    estimator.calls[0].resolve(estimated(1));
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);

    estimator.calls[1].resolve(estimated(2));
    await flush();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops notifying a listener once closed", async () => {
    const estimator = new FakeEstimator();
    const queue = createEstimationQueue(estimator);
    const listener = vi.fn();
    const subscription = queue.onChange(listener);

    queue.request([resize("https://a.test/1.jpg")]);
    subscription.close();
    estimator.calls[0].resolve(estimated(1));
    await flush();

    expect(listener).not.toHaveBeenCalled();
  });

  it("stores failed(encode-failed) when the estimator rejects and still runs the next job", async () => {
    const estimator = new FakeEstimator();
    const queue = createEstimationQueue(estimator);
    const listener = vi.fn();
    queue.onChange(listener);

    queue.request([resize("https://a.test/1.jpg"), resize("https://a.test/2.jpg")]);
    estimator.calls[0].reject(new Error("boom"));
    await flush();

    expect(queue.lookup(resize("https://a.test/1.jpg"))).toEqual({
      status: "failed",
      reason: "encode-failed",
      message: "boom",
    });
    expect(estimator.calls).toHaveLength(2);

    estimator.calls[1].resolve(estimated(5));
    await flush();
    expect(queue.lookup(resize("https://a.test/2.jpg"))).toEqual(estimated(5));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stop() skips queued and in-flight jobs, keeps estimated ones and ignores late results", async () => {
    const estimator = new FakeEstimator();
    const queue = createEstimationQueue(estimator);
    const listener = vi.fn();
    queue.request([
      resize("https://a.test/1.jpg"),
      resize("https://a.test/2.jpg"),
      resize("https://a.test/3.jpg"),
    ]);
    estimator.calls[0].resolve(estimated(60_000));
    await flush();
    listener.mockClear();
    queue.onChange(listener);

    queue.stop();

    const stopped = { status: "skipped", reason: "analysis-stopped" };
    expect(queue.lookup(resize("https://a.test/1.jpg"))).toEqual(estimated(60_000));
    expect(queue.lookup(resize("https://a.test/2.jpg"))).toEqual(stopped);
    expect(queue.lookup(resize("https://a.test/3.jpg"))).toEqual(stopped);
    expect(queue.pendingCount()).toBe(0);
    expect(estimator.cancelCalls).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    // The in-flight estimate settles after stop: ignored, and no further job starts.
    estimator.calls[1].resolve(estimated(1));
    await flush();
    expect(queue.lookup(resize("https://a.test/2.jpg"))).toEqual(stopped);
    expect(estimator.calls).toHaveLength(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stop() is idempotent and request() after stop is a no-op", () => {
    const estimator = new FakeEstimator();
    const queue = createEstimationQueue(estimator);
    const listener = vi.fn();
    queue.onChange(listener);
    queue.request([resize("https://a.test/1.jpg")]);

    queue.stop();
    queue.stop();
    queue.request([resize("https://a.test/9.jpg")]);

    expect(estimator.cancelCalls).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(queue.lookup(resize("https://a.test/9.jpg"))).toBeUndefined();
    expect(estimator.calls).toHaveLength(1);
  });
});
