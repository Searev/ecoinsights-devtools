import { describe, expect, it, vi } from "vitest";
import { createWorkQueue } from "./work-queue";

type Out = { status: "ok"; value: number } | { status: "ko"; message?: string };

interface Call {
  job: string;
  resolve: (o: Out) => void;
  reject: (e: unknown) => void;
}

function setup() {
  const calls: Call[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const cancel = vi.fn();
  const queue = createWorkQueue<string, Out>({
    keyOf: (job) => job.toLowerCase(),
    run: (job) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise<Out>((resolve, reject) => {
        calls.push({
          job,
          resolve: (o) => {
            inFlight--;
            resolve(o);
          },
          reject: (e) => {
            inFlight--;
            reject(e);
          },
        });
      });
    },
    onRunError: (e) => ({ status: "ko", message: e instanceof Error ? e.message : String(e) }),
    stoppedOutcome: { status: "ko", message: "stopped" },
    cancel,
  });
  return { queue, calls, cancel, maxInFlight: () => maxInFlight };
}

const ok = (value: number): Out => ({ status: "ok", value });
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("WorkQueue", () => {
  it("runs once per key however many times the same job is requested", async () => {
    const { queue, calls } = setup();
    queue.request(["A"]);
    queue.request(["a", "A"]);
    calls[0].resolve(ok(1));
    await flush();
    queue.request(["a"]);
    await flush();
    expect(calls).toHaveLength(1);
    expect(queue.lookup("A")).toEqual(ok(1));
  });

  it("runs jobs in FIFO order, one at a time", async () => {
    const { queue, calls, maxInFlight } = setup();
    queue.request(["a", "b"]);
    queue.request(["c"]);
    expect(calls.map((c) => c.job)).toEqual(["a"]);
    expect(queue.pendingCount()).toBe(3);
    calls[0].resolve(ok(1));
    await flush();
    calls[1].resolve(ok(2));
    await flush();
    calls[2].resolve(ok(3));
    await flush();
    expect(calls.map((c) => c.job)).toEqual(["a", "b", "c"]);
    expect(maxInFlight()).toBe(1);
    expect(queue.pendingCount()).toBe(0);
  });

  it("looks up pending, then the outcome, and undefined for unknown jobs", async () => {
    const { queue, calls } = setup();
    expect(queue.lookup("a")).toBeUndefined();
    queue.request(["a"]);
    expect(queue.lookup("a")).toEqual({ status: "pending" });
    calls[0].resolve(ok(1));
    await flush();
    expect(queue.lookup("a")).toEqual(ok(1));
    expect(queue.lookup("zzz")).toBeUndefined();
  });

  it("notifies once per settled job and never synchronously from request()", async () => {
    const { queue, calls } = setup();
    const listener = vi.fn();
    queue.onChange(listener);
    queue.request(["a", "b"]);
    expect(listener).not.toHaveBeenCalled();
    calls[0].resolve(ok(1));
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    calls[1].resolve(ok(2));
    await flush();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops notifying a listener once closed", async () => {
    const { queue, calls } = setup();
    const listener = vi.fn();
    const subscription = queue.onChange(listener);
    queue.request(["a"]);
    subscription.close();
    calls[0].resolve(ok(1));
    await flush();
    expect(listener).not.toHaveBeenCalled();
  });

  it("maps a rejection (and a synchronous throw) to onRunError and runs the next job", async () => {
    const { queue, calls } = setup();
    queue.request(["a", "b"]);
    calls[0].reject(new Error("boom"));
    await flush();
    expect(queue.lookup("a")).toEqual({ status: "ko", message: "boom" });
    expect(calls).toHaveLength(2);

    const throwing = createWorkQueue<string, Out>({
      keyOf: (j) => j,
      run: () => {
        throw new Error("sync");
      },
      onRunError: (e) => ({ status: "ko", message: (e as Error).message }),
      stoppedOutcome: { status: "ko" },
    });
    throwing.request(["x"]);
    await flush();
    expect(throwing.lookup("x")).toEqual({ status: "ko", message: "sync" });
  });

  it("stop() settles queued and in-flight jobs, keeps outcomes and ignores late results", async () => {
    const { queue, calls, cancel } = setup();
    const listener = vi.fn();
    queue.request(["a", "b", "c"]);
    calls[0].resolve(ok(1));
    await flush();
    queue.onChange(listener);

    queue.stop();

    const stopped = { status: "ko", message: "stopped" };
    expect(queue.lookup("a")).toEqual(ok(1));
    expect(queue.lookup("b")).toEqual(stopped);
    expect(queue.lookup("c")).toEqual(stopped);
    expect(queue.pendingCount()).toBe(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);

    calls[1].resolve(ok(9));
    await flush();
    expect(queue.lookup("b")).toEqual(stopped);
    expect(calls).toHaveLength(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stop() is idempotent and request() after stop is a no-op", () => {
    const { queue, calls, cancel } = setup();
    const listener = vi.fn();
    queue.onChange(listener);
    queue.request(["a"]);
    queue.stop();
    queue.stop();
    queue.request(["z"]);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(queue.lookup("z")).toBeUndefined();
    expect(calls).toHaveLength(1);
  });
});
