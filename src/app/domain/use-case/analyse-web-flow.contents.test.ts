import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import analyseWebFlow, { WebFlowAnalysis, WebFlowAnalysisParams } from "./analyse-web-flow";
import { MockBrowser } from "../../infra/mock-browser";
import { PageAnalysis } from "../models/page-analysis";
import { NetworkRequest } from "../models/network-request";
import { ContentOutcome } from "../models/text-content";
import { minifyTextFilesRule } from "../best-practices/rules/minify-text-files.rule";
import { request as baseRequest } from "../best-practices/testing/image-fixtures";
import { DeferredContentAnalyser } from "./testing/fake-content-analyser";

const PARAMS: WebFlowAnalysisParams = {
  refreshOnStart: false,
  triggerNewPageOnLinkClicked: false,
  triggerNewPageOnFormSubmitted: false,
  checkBestPractices: true,
};
const OPTIONS = { domPollIntervalMs: 1000, collectMinIntervalMs: 5000, rules: [minifyTextFilesRule] };
const ID = "MinifyTextFiles";

const js = (name: string): NetworkRequest =>
  baseRequest(`https://cdn.test/${name}`, { type: "text/javascript", responseSize: 20_000 });
const URL_A = "https://cdn.test/a.js";
const URL_B = "https://cdn.test/b.js";

const minified: ContentOutcome = { status: "analysed", characters: 20_000, removableCharacters: 100 };
const bloated: ContentOutcome = { status: "analysed", characters: 20_000, removableCharacters: 8_000 };

describe("analyseWebFlow content analysis", () => {
  let browser: MockBrowser;
  let analyser: DeferredContentAnalyser;
  let results: PageAnalysis[][];
  let flow: WebFlowAnalysis | undefined;
  const consume = (pages: PageAnalysis[]) => results.push(pages);
  const last = () => results[results.length - 1];
  const flush = () => vi.advanceTimersByTimeAsync(0);
  const rule = (pages: PageAnalysis[], page: number) => pages[page].bestPractices!.find((b) => b.id === ID)!;

  const start = async (contentAnalyser: DeferredContentAnalyser | null = analyser) => {
    flow = await analyseWebFlow(browser, PARAMS, consume, {
      ...OPTIONS,
      contentAnalyser: contentAnalyser ?? undefined,
    });
    return flow;
  };

  const settle = async (outcome: ContentOutcome, url?: string) => {
    expect(analyser.settle(outcome, url)).toBe(true);
    await flush();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    analyser = new DeferredContentAnalyser();
    results = [];
    flow = undefined;
    browser = new MockBrowser({
      pageInfo: { title: "Home", url: "https://www.example.org/", domSize: 100 },
      requests: [js("a.js"), js("b.js")],
    });
  });

  afterEach(() => {
    flow?.stopAnalysis();
    vi.useRealTimers();
  });

  it("scenario 9: shows progress, then the grade by itself once contents settle", async () => {
    await start();
    expect(rule(last(), 0).progress).toEqual({ done: 0, total: 2, unit: "files" });
    expect(rule(last(), 0).compliance).toBeUndefined();

    await settle(minified);
    expect(rule(last(), 0).progress).toEqual({ done: 1, total: 2, unit: "files" });

    const before = results.length;
    await settle(bloated);
    expect(results.length).toBeGreaterThan(before);
    expect(rule(last(), 0).progress).toBeUndefined();
    expect(rule(last(), 0).compliance).toBe("B");
  });

  it("analyses each URL once across two pages", async () => {
    await start();
    browser.setPageInfo({ title: "p2", url: "https://www.example.org/2", domSize: 100 });
    browser.emitNavigation({ kind: "url-changed", url: "https://www.example.org/2" });
    await flush();
    browser.emitNetworkRequest(js("a.js"));
    browser.emitNetworkRequest(js("b.js"));
    await flush();

    // One analysis in flight at a time: b.js starts once a.js settles.
    expect(analyser.jobs.map((j) => j.url)).toEqual([URL_A]);
    await settle(minified);
    await settle(minified);
    expect(analyser.jobs.map((j) => j.url)).toEqual([URL_A, URL_B]);
    expect(rule(last(), 0).compliance).toBe("A");
    expect(rule(last(), 1).compliance).toBe("A");
    expect(analyser.jobs).toHaveLength(2);
  });

  it("rebuilds a closed page when a content settles", async () => {
    await start();
    flow!.stopCurrentNavigation();
    await flush();
    expect(rule(last(), 0).progress?.done).toBe(0);
    await settle(bloated);
    await settle(bloated);
    expect(rule(last(), 0).compliance).toBe("C");
  });

  it("scenario 10: stop saves pending files as not evaluated (analysis stopped) and cancels the analyser", async () => {
    await start();
    await settle(minified);
    const pages = flow!.stopAnalysis();
    const stopped = pages[0].bestPractices!.find((b) => b.id === ID)!;
    expect(stopped.progress).toBeUndefined();
    expect(stopped.compliance).toBe("A");
    expect(stopped.detail).toContain("(1 fichier non évalué)");
    expect(stopped.offenders).toEqual(["b.js (JS, 20 ko) : non évalué (analyse arrêtée)"]);
    expect(analyser.cancel).toHaveBeenCalledTimes(1);
  });

  it("shows Non évaluée without an analyser", async () => {
    await start(null);
    await flush();
    const res = rule(last(), 0);
    expect(res.compliance).toBeUndefined();
    expect(res.progress).toBeUndefined();
    expect(res.detail).toBe("Contenu des fichiers non disponible");
  });

  it("makes no content analysis when best practices are not checked", async () => {
    flow = await analyseWebFlow(browser, { ...PARAMS, checkBestPractices: false }, consume, {
      ...OPTIONS,
      contentAnalyser: analyser,
    });
    expect(analyser.jobs).toEqual([]);
  });
});
