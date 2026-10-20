import { describe, expect, it } from "vitest";
import { ContentAnalyser } from "../models/content-analyser";
import { ContentJob, ContentOutcome } from "../models/text-content";
import { createContentQueue } from "./content-queue";

class FakeAnalyser implements ContentAnalyser {
  calls: { job: ContentJob; resolve: (o: ContentOutcome) => void; reject: (e: unknown) => void }[] = [];
  cancelCalls = 0;
  analyse(job: ContentJob): Promise<ContentOutcome> {
    return new Promise((resolve, reject) => this.calls.push({ job, resolve, reject }));
  }
  cancel() {
    this.cancelCalls++;
  }
}

const job = (url: string): ContentJob => ({ url, type: "JS" });
const analysed: ContentOutcome = { status: "analysed", characters: 1000, removableCharacters: 10 };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("ContentQueue", () => {
  it("analyses a URL once, however many times it is requested (dedupe by contentKey)", async () => {
    const analyser = new FakeAnalyser();
    const queue = createContentQueue(analyser);
    queue.request([job("https://a.test/app.js")]);
    queue.request([job("https://a.test/app.js#frag"), job("https://a.test/app.js")]);
    analyser.calls[0].resolve(analysed);
    await flush();
    queue.request([job("https://a.test/app.js")]);
    await flush();
    expect(analyser.calls).toHaveLength(1);
    expect(queue.lookup(job("https://a.test/app.js"))).toEqual(analysed);
  });

  it("settles pending jobs as not-evaluated(analysis-stopped) on stop and cancels the analyser", async () => {
    const analyser = new FakeAnalyser();
    const queue = createContentQueue(analyser);
    queue.request([job("https://a.test/1.js"), job("https://a.test/2.js")]);
    queue.stop();
    const stopped = { status: "not-evaluated", reason: "analysis-stopped" };
    expect(queue.lookup(job("https://a.test/1.js"))).toEqual(stopped);
    expect(queue.lookup(job("https://a.test/2.js"))).toEqual(stopped);
    expect(analyser.cancelCalls).toBe(1);
  });

  it("turns a rejection into not-evaluated(analysis-failed) with the message", async () => {
    const analyser = new FakeAnalyser();
    const queue = createContentQueue(analyser);
    queue.request([job("https://a.test/1.js")]);
    analyser.calls[0].reject(new Error("boom"));
    await flush();
    expect(queue.lookup(job("https://a.test/1.js"))).toEqual({
      status: "not-evaluated",
      reason: "analysis-failed",
      message: "boom",
    });
  });
});
