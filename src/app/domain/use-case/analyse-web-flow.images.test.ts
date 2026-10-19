import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import analyseWebFlow, {
  WebFlowAnalysis,
  WebFlowAnalysisParams,
} from "./analyse-web-flow";
import { MockBrowser } from "../../infra/mock-browser";
import { PageAnalysis } from "../models/page-analysis";
import { NetworkRequest } from "../models/network-request";
import { BestPracticeRule } from "../best-practices/rule";
import { RULES } from "../best-practices";
import { dontResizeImagesRule } from "../best-practices/rules/dont-resize-images.rule";
import { optimisedFormatsRule } from "../best-practices/rules/optimised-formats.rule";
import {
  estimated,
  request as imageRequest,
} from "../best-practices/testing/image-fixtures";
import { DeferredImageEstimator } from "./testing/fake-image-estimator";

const PARAMS: WebFlowAnalysisParams = {
  refreshOnStart: false,
  triggerNewPageOnLinkClicked: false,
  triggerNewPageOnFormSubmitted: false,
  checkBestPractices: true,
};
const OPTIONS = { domPollIntervalMs: 1000, collectMinIntervalMs: 5000 };

const RESIZE_ID = "DontResizeImagesInBrowser";

const hero = (n = 1) => `https://www.example.org/hero${n}.jpg`;

/** A 4000×3000 JPEG displayed at 400×300 on a 1x screen: resize target is 400×300. */
function oversized(src: string) {
  return {
    src,
    displayWidth: 400,
    displayHeight: 300,
    naturalWidth: 4000,
    naturalHeight: 3000,
  };
}

function resizePageData(srcs: string[]) {
  return {
    [RESIZE_ID]: {
      ok: true as const,
      data: { devicePixelRatio: 1, images: srcs.map(oversized) },
    },
  };
}

const jpeg = (src: string, transferSize = 500_000): NetworkRequest =>
  imageRequest(src, { responseSize: 500_000, transferSize });

describe("analyseWebFlow image estimation", () => {
  let browser: MockBrowser;
  let estimator: DeferredImageEstimator;
  let results: PageAnalysis[][];
  let flow: WebFlowAnalysis | undefined;
  const consume = (pages: PageAnalysis[]) => results.push(pages);
  const last = () => results[results.length - 1];

  const flush = () => vi.advanceTimersByTimeAsync(0);

  const start = async (
    rules: BestPracticeRule<any>[],
    params: Partial<WebFlowAnalysisParams> = {},
    imageEstimator: DeferredImageEstimator | null = estimator
  ) => {
    flow = await analyseWebFlow(browser, { ...PARAMS, ...params }, consume, {
      ...OPTIONS,
      rules,
      imageEstimator: imageEstimator ?? undefined,
    });
    return flow;
  };

  /** Settles a call then lets the queue and the use case react. */
  const settle = async (
    kind: "resize" | "convert" | "resize-convert",
    outcome = estimated(500_000, 100_000),
    url?: string
  ) => {
    expect(estimator.settle(kind, outcome, url)).toBe(true);
    await flush();
  };

  /** Navigates to a new page, collects its page data (DOM change) and emits `requests`. */
  const navigate = async (url: string, requests: NetworkRequest[] = []) => {
    browser.setPageInfo({ title: url, url, domSize: 100 });
    browser.emitNavigation({ kind: "url-changed", url });
    await flush();
    browser.setPageInfo({ title: url, url, domSize: 400 });
    await vi.advanceTimersByTimeAsync(1000);
    requests.forEach((r) => browser.emitNetworkRequest(r));
  };

  const ruleOf = (pages: PageAnalysis[], page: number, id: string) =>
    pages[page].bestPractices!.find((b) => b.id === id)!;

  beforeEach(() => {
    vi.useFakeTimers();
    estimator = new DeferredImageEstimator();
    results = [];
    flow = undefined;
    browser = new MockBrowser({
      pageInfo: { title: "Home", url: "https://www.example.org/", domSize: 100 },
      requests: [jpeg(hero())],
      pageData: resizePageData([hero()]),
    });
  });

  afterEach(() => {
    flow?.stopAnalysis();
    vi.useRealTimers();
  });

  it("shows the resize rule in progress, then graded after the estimate settles, without user action", async () => {
    await start([...RULES]);

    const first = ruleOf(last(), 0, RESIZE_ID);
    expect(first.progress).toEqual({ done: 0, total: 1 });
    expect(first.compliance).toBeUndefined();

    const before = results.length;
    await settle("resize", estimated(500_000, 100_000));

    expect(results.length).toBeGreaterThan(before);
    const graded = ruleOf(last(), 0, RESIZE_ID);
    expect(graded.progress).toBeUndefined();
    expect(graded.compliance).toBe("C");
    expect(graded.images?.[0].gainBytes).toBe(400_000);
  });

  it("estimates an image shared by three pages once, with the same gain on each page", async () => {
    await start([dontResizeImagesRule]);
    await navigate("https://www.example.org/2", [jpeg(hero())]);
    await navigate("https://www.example.org/3", [jpeg(hero())]);

    expect(estimator.jobsOfKind("resize")).toHaveLength(1);
    await settle("resize", estimated(500_000, 100_000));

    expect(last()).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      const rule = ruleOf(last(), i, RESIZE_ID);
      expect(rule.images?.[0].gainBytes).toBe(400_000);
      expect(last()[i].imageGain?.bytes).toBe(400_000);
    }
    expect(estimator.calls).toHaveLength(1);
  });

  it("updates a closed page when its estimate settles later, leaving its other fields unchanged", async () => {
    await start([dontResizeImagesRule]);
    await navigate("https://www.example.org/2");
    const closedBefore = last()[0];
    expect(ruleOf(last(), 0, RESIZE_ID).progress).toBeDefined();

    await settle("resize", estimated(500_000, 100_000));

    const closedAfter = last()[0];
    expect(ruleOf(last(), 0, RESIZE_ID).compliance).toBe("C");
    expect(closedAfter.imageGain).toMatchObject({ bytes: 400_000, pendingCount: 0 });
    const frozen = (p: PageAnalysis) => ({
      ...p,
      bestPractices: undefined,
      imageGain: undefined,
    });
    expect(frozen(closedAfter)).toEqual(frozen(closedBefore));
  });

  it("settles pending estimations as analysis-stopped on stop, without any further consume", async () => {
    const srcs = [hero(1), hero(2), hero(3), hero(4)];
    browser = new MockBrowser({
      pageInfo: { title: "Home", url: "https://www.example.org/", domSize: 100 },
      requests: srcs.map((s) => jpeg(s)),
      pageData: resizePageData(srcs),
    });
    await start([dontResizeImagesRule]);
    await settle("resize", estimated(500_000, 100_000), srcs[0]);
    expect(estimator.jobs).toHaveLength(2); // second one in flight, two still queued

    const consumed = results.length;
    const pages = flow!.stopAnalysis();

    const rule = pages[0].bestPractices!.find((b) => b.id === RESIZE_ID)!;
    expect(rule.compliance).toBe("C");
    expect(rule.progress).toBeUndefined();
    const stopped = rule.images!.filter((f) => f.state === "skipped");
    expect(stopped).toHaveLength(3);
    expect(stopped.every((f) => f.reason === "analysis-stopped")).toBe(true);
    expect(
      rule.offenders!.filter((l) => l.includes("non évaluée (analyse arrêtée)"))
    ).toHaveLength(3);
    expect(estimator.cancel).toHaveBeenCalled();

    // A late result and the passing of time do not reach consume.
    estimator.settle("resize", estimated(500_000, 100_000));
    await vi.advanceTimersByTimeAsync(5000);
    expect(results.length).toBe(consumed);

    expect(flow!.stopAnalysis()).toEqual(pages);
  });

  it("requests the resize-convert job only after both single estimates settled", async () => {
    await start([dontResizeImagesRule, optimisedFormatsRule]);
    expect(estimator.jobsOfKind("resize-convert")).toHaveLength(0);

    await settle("resize", estimated(500_000, 100_000));
    expect(estimator.jobsOfKind("resize-convert")).toHaveLength(0);
    expect(last()[0].imageGain?.pendingCount).toBe(1);

    await settle("convert", estimated(500_000, 200_000));
    expect(estimator.jobsOfKind("resize-convert")).toHaveLength(1);
    expect(estimator.jobsOfKind("resize-convert")[0].transform).toEqual({
      kind: "resize-convert",
      width: 400,
      height: 300,
    });

    await settle("resize-convert", estimated(500_000, 50_000));
    expect(last()[0].imageGain).toMatchObject({ bytes: 450_000, pendingCount: 0 });
  });

  it("counts a cached image as 0 gain on the page that did not transfer it", async () => {
    await start([dontResizeImagesRule, optimisedFormatsRule]);
    await navigate("https://www.example.org/2", [jpeg(hero(), 0)]);

    await settle("resize", estimated(500_000, 100_000));
    await settle("convert", estimated(500_000, 200_000));
    await settle("resize-convert", estimated(500_000, 50_000));

    expect(last()[0].imageGain?.bytes).toBe(450_000);
    expect(last()[1].imageGain).toMatchObject({ bytes: 0, pendingCount: 0 });
  });

  it("shows the image rules as not evaluated, without hanging, when no estimator is injected", async () => {
    await start([dontResizeImagesRule], {}, null);
    await vi.advanceTimersByTimeAsync(10);

    const rule = ruleOf(last(), 0, RESIZE_ID);
    expect(rule.compliance).toBeUndefined();
    expect(rule.progress).toBeUndefined();
    expect(rule.detail).toContain("Non évaluée");
  });

  it("does not estimate anything when best practices are off", async () => {
    await start([...RULES], { checkBestPractices: false });
    await vi.advanceTimersByTimeAsync(2000);

    expect(estimator.calls).toHaveLength(0);
    expect(last()[0].bestPractices).toEqual([]);
    expect(last()[0].imageGain).toBeUndefined();
    expect(flow!.stopAnalysis()[0].imageGain).toBeUndefined();
  });

  it("does not re-evaluate closed pages on a network request when no estimate changed", async () => {
    const evaluate = vi.fn(() => ({ compliance: "A" as const, detail: "ok" }));
    const counting: BestPracticeRule<unknown> = {
      id: "counting",
      name: "Counting",
      category: "content",
      evaluate,
    };
    await start([counting]);
    flow!.stopCurrentNavigation();
    const afterClose = evaluate.mock.calls.length;

    browser.emitNetworkRequest(imageRequest("https://www.example.org/a.js"));
    browser.emitNetworkRequest(imageRequest("https://www.example.org/b.js"));

    // One evaluation per request: the (waiting) current page only.
    expect(evaluate.mock.calls.length).toBe(afterClose + 2);
    expect(last()).toHaveLength(2);
  });
});
