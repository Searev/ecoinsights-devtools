import { describe, expect, it } from "vitest";
import { BestPractice } from "../models/best-practice";
import {
  EstimateLookup,
  EstimateState,
  EstimationJob,
  FailReason,
  ImageFinding,
  OPTIMISED_FORMATS_RULE_ID,
  RESIZE_IMAGES_RULE_ID,
  SkipReason,
  estimationKey,
} from "../models/image-estimation";
import { NetworkRequest } from "../models/network-request";
import { computePageImageGain, planCombinedEstimations } from "./image-gain";

const url = (name: string) => `https://site.test/${name}`;

const request = (name: string, transferSize: number, code = 200): NetworkRequest => ({
  method: "GET",
  url: new URL(url(name)),
  code,
  type: "image/jpeg",
  responseSize: transferSize,
  transferSize,
});

const finding = (name: string, extra: Partial<ImageFinding>): ImageFinding => ({
  url: url(name),
  originalBytes: 240_000,
  state: "estimated",
  offender: false,
  declaredType: "image/jpeg",
  ...extra,
});

const resizeOffender = (name: string, gainBytes: number, extra: Partial<ImageFinding> = {}) =>
  finding(name, {
    gainBytes,
    estimatedBytes: 240_000 - gainBytes,
    offender: gainBytes >= 10_000,
    target: { width: 600, height: 400 },
    ...extra,
  });

const formatOffender = (name: string, gainBytes: number, extra: Partial<ImageFinding> = {}) =>
  finding(name, {
    gainBytes,
    estimatedBytes: 240_000 - gainBytes,
    offender: gainBytes >= 10_000,
    encoding: { format: "avif", quality: 65, speed: 6 },
    ...extra,
  });

const rule = (id: string, images: ImageFinding[]): BestPractice => ({
  id,
  name: id,
  category: "images",
  detail: "",
  images,
});

const resizeRule = (images: ImageFinding[]) => rule(RESIZE_IMAGES_RULE_ID, images);
const formatRule = (images: ImageFinding[]) => rule(OPTIMISED_FORMATS_RULE_ID, images);

const combinedJob = (name: string): EstimationJob => ({
  url: url(name),
  declaredType: "image/jpeg",
  transform: { kind: "resize-convert", width: 600, height: 400 },
});

const lookupOf = (entries: [EstimationJob, EstimateState][]): EstimateLookup => {
  const map = new Map(entries.map(([job, state]) => [estimationKey(job), state]));
  return (job) => map.get(estimationKey(job));
};

const combinedEstimated = (encodedBytes: number): EstimateState => ({
  status: "estimated",
  sourceFormat: "jpeg",
  target: { format: "avif", quality: 65, speed: 6 },
  sourceBytes: 240_000,
  encodedBytes,
  width: 1200,
  height: 800,
});

const none: EstimateLookup = () => undefined;

describe("computePageImageGain", () => {
  it("combines both offenders with the combined estimate: 240 kB image reduced to 36 kB gives 204 kB", () => {
    const input = {
      requests: [request("a.jpg", 240_000)],
      bestPractices: [
        resizeRule([resizeOffender("a.jpg", 180_000)]),
        formatRule([formatOffender("a.jpg", 144_000)]),
      ],
      estimates: lookupOf([[combinedJob("a.jpg"), combinedEstimated(36_000)]]),
    };

    expect(computePageImageGain(input)).toEqual({
      bytes: 204_000,
      pendingCount: 0,
      notEvaluatedCount: 0,
      fallbackCount: 0,
    });
    expect(planCombinedEstimations(input)).toEqual([combinedJob("a.jpg")]);
  });

  it("takes the declared type of the format finding when the resize finding has none", () => {
    const jobs = planCombinedEstimations({
      requests: [request("a.jpg", 240_000)],
      bestPractices: [
        resizeRule([resizeOffender("a.jpg", 180_000, { declaredType: "" })]),
        formatRule([formatOffender("a.jpg", 144_000, { declaredType: "image/png" })]),
      ],
      estimates: none,
    });

    expect(jobs[0].declaredType).toBe("image/png");
  });

  it("adds resize-only and format-only gains without planning a combined job", () => {
    const input = {
      requests: [request("a.jpg", 240_000), request("b.jpg", 240_000)],
      bestPractices: [
        resizeRule([resizeOffender("a.jpg", 30_000)]),
        formatRule([formatOffender("b.jpg", 20_000)]),
      ],
      estimates: none,
    };

    expect(computePageImageGain(input)).toEqual({
      bytes: 50_000,
      pendingCount: 0,
      notEvaluatedCount: 0,
      fallbackCount: 0,
    });
    expect(planCombinedEstimations(input)).toEqual([]);
  });

  it("ignores images the page did not transfer (transfer size 0)", () => {
    const input = {
      requests: [request("cached.jpg", 0), request("a.jpg", 240_000)],
      bestPractices: [
        resizeRule([resizeOffender("cached.jpg", 100_000), resizeOffender("a.jpg", 30_000)]),
        formatRule([formatOffender("cached.jpg", 100_000)]),
      ],
      estimates: none,
    };

    expect(computePageImageGain(input)?.bytes).toBe(30_000);
    expect(planCombinedEstimations(input)).toEqual([]);
  });

  it("ignores images with no matching request", () => {
    const gain = computePageImageGain({
      requests: [],
      bestPractices: [resizeRule([resizeOffender("a.jpg", 30_000)])],
      estimates: none,
    });

    expect(gain?.bytes).toBe(0);
  });

  it("counts pending images as a lower bound: 2 estimated (120 kB) + 3 pending", () => {
    const names = ["a", "b", "c", "d", "e"].map((n) => `${n}.jpg`);
    const gain = computePageImageGain({
      requests: names.map((n) => request(n, 240_000)),
      bestPractices: [
        resizeRule([
          resizeOffender("a.jpg", 60_000),
          resizeOffender("b.jpg", 60_000),
          finding("c.jpg", { state: "pending" }),
          finding("d.jpg", { state: "pending" }),
          finding("e.jpg", { state: "pending" }),
        ]),
      ],
      estimates: none,
    });

    expect(gain).toEqual({
      bytes: 120_000,
      pendingCount: 3,
      notEvaluatedCount: 0,
      fallbackCount: 0,
    });
  });

  it("counts a pending combined estimate as pending and plans no job while a finding is pending", () => {
    const requests = [request("a.jpg", 240_000), request("b.jpg", 240_000)];
    const bestPractices = [
      resizeRule([resizeOffender("a.jpg", 180_000), finding("b.jpg", { state: "pending" })]),
      formatRule([formatOffender("a.jpg", 144_000), formatOffender("b.jpg", 144_000)]),
    ];
    const estimates = lookupOf([[combinedJob("a.jpg"), { status: "pending" }]]);

    expect(computePageImageGain({ requests, bestPractices, estimates })).toEqual({
      bytes: 0,
      pendingCount: 2,
      notEvaluatedCount: 0,
      fallbackCount: 0,
    });
    expect(planCombinedEstimations({ requests, bestPractices, estimates })).toEqual([
      combinedJob("a.jpg"),
    ]);
  });

  it("treats a combined job that was never requested as pending", () => {
    const gain = computePageImageGain({
      requests: [request("a.jpg", 240_000)],
      bestPractices: [
        resizeRule([resizeOffender("a.jpg", 180_000)]),
        formatRule([formatOffender("a.jpg", 144_000)]),
      ],
      estimates: none,
    });

    expect(gain).toMatchObject({ bytes: 0, pendingCount: 1 });
  });

  it("counts failed and too-large images as not evaluated", () => {
    const failed = (reason: FailReason) => ({ state: "failed" as const, reason });
    const skipped = (reason: SkipReason) => ({ state: "skipped" as const, reason });
    const gain = computePageImageGain({
      requests: ["a", "b", "c", "d"].map((n) => request(`${n}.jpg`, 240_000)),
      bestPractices: [
        resizeRule([
          finding("a.jpg", failed("encode-failed")),
          finding("b.jpg", skipped("too-large")),
          finding("c.jpg", skipped("analysis-stopped")),
          resizeOffender("d.jpg", 40_000),
        ]),
      ],
      estimates: none,
    });

    expect(gain).toEqual({
      bytes: 40_000,
      pendingCount: 0,
      notEvaluatedCount: 3,
      fallbackCount: 0,
    });
  });

  it("ignores out-of-scope skips", () => {
    const reasons: SkipReason[] = [
      "unsupported-format",
      "animated",
      "already-optimised",
      "not-an-image",
    ];
    const gain = computePageImageGain({
      requests: reasons.map((_, i) => request(`i${i}.jpg`, 240_000)),
      bestPractices: [
        formatRule(
          reasons.map((reason, i) => finding(`i${i}.jpg`, { state: "skipped", reason }))
        ),
      ],
      estimates: none,
    });

    expect(gain).toEqual({
      bytes: 0,
      pendingCount: 0,
      notEvaluatedCount: 0,
      fallbackCount: 0,
    });
  });

  it("falls back to max(resize, format) and counts it when the combined estimate failed", () => {
    const gain = computePageImageGain({
      requests: [request("a.jpg", 240_000)],
      bestPractices: [
        resizeRule([resizeOffender("a.jpg", 180_000)]),
        formatRule([formatOffender("a.jpg", 144_000)]),
      ],
      estimates: lookupOf([
        [combinedJob("a.jpg"), { status: "failed", reason: "encode-failed" }],
      ]),
    });

    expect(gain).toEqual({
      bytes: 180_000,
      pendingCount: 0,
      notEvaluatedCount: 0,
      fallbackCount: 1,
    });
  });

  it("falls back as well when the combined estimate was skipped", () => {
    const gain = computePageImageGain({
      requests: [request("a.jpg", 240_000)],
      bestPractices: [
        resizeRule([resizeOffender("a.jpg", 100_000)]),
        formatRule([formatOffender("a.jpg", 144_000)]),
      ],
      estimates: lookupOf([
        [combinedJob("a.jpg"), { status: "skipped", reason: "analysis-stopped" }],
      ]),
    });

    expect(gain).toMatchObject({ bytes: 144_000, fallbackCount: 1 });
  });

  it("does not count a combined gain under the 10 kB noise threshold", () => {
    const gain = computePageImageGain({
      requests: [request("a.jpg", 240_000)],
      bestPractices: [
        resizeRule([resizeOffender("a.jpg", 180_000)]),
        formatRule([formatOffender("a.jpg", 144_000)]),
      ],
      estimates: lookupOf([[combinedJob("a.jpg"), combinedEstimated(235_000)]]),
    });

    expect(gain?.bytes).toBe(0);
  });

  it("clamps a combined result bigger than the original to 0", () => {
    const gain = computePageImageGain({
      requests: [request("a.jpg", 240_000)],
      bestPractices: [
        resizeRule([resizeOffender("a.jpg", 180_000)]),
        formatRule([formatOffender("a.jpg", 144_000)]),
      ],
      estimates: lookupOf([[combinedJob("a.jpg"), combinedEstimated(300_000)]]),
    });

    expect(gain?.bytes).toBe(0);
  });

  it("does not count a single-rule gain under the noise threshold", () => {
    const gain = computePageImageGain({
      requests: [request("a.jpg", 240_000)],
      bestPractices: [resizeRule([finding("a.jpg", { gainBytes: 8_000, offender: true })])],
      estimates: none,
    });

    expect(gain?.bytes).toBe(0);
  });

  it("returns undefined when no image rule is present", () => {
    expect(
      computePageImageGain({
        requests: [request("a.jpg", 240_000)],
        bestPractices: [rule("PrintStyleSheet", [])],
        estimates: none,
      })
    ).toBeUndefined();
  });

  it("returns a zero gain when an image rule is present but has no finding", () => {
    expect(
      computePageImageGain({ requests: [], bestPractices: [formatRule([])], estimates: none })
    ).toEqual({ bytes: 0, pendingCount: 0, notEvaluatedCount: 0, fallbackCount: 0 });
  });
});
