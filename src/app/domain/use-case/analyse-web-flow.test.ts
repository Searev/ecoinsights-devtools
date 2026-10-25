import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import analyseWebFlow, {
  WebFlowAnalysis,
  WebFlowAnalysisParams,
} from "./analyse-web-flow";
import { MockBrowser } from "../../infra/mock-browser";
import { PageAnalysis } from "../models/page-analysis";
import { NetworkRequest } from "../models/network-request";
import { BestPracticeRule } from "../best-practices/rule";
import { limitRequestsRule } from "../best-practices/rules/limit-requests.rule";

const BASE: WebFlowAnalysisParams = {
  refreshOnStart: false,
  triggerNewPageOnLinkClicked: false,
  triggerNewPageOnFormSubmitted: false,
  checkBestPractices: false,
};

const OPTIONS = { domPollIntervalMs: 1000, collectMinIntervalMs: 5000 };

const fakeRule: BestPracticeRule<number> = {
  id: "fake",
  name: "Fake rule",
  category: "content",
  collect: () => 1,
  evaluate: (ctx) => ({
    compliance: ctx.page === undefined ? "C" : "A",
    detail: `page=${ctx.page}`,
    offenders: [ctx.url],
  }),
};

function request(path = "/a.js", size = 1000): NetworkRequest {
  return {
    method: "GET",
    url: new URL("https://www.example.org" + path),
    code: 200,
    type: "text/javascript",
    responseSize: size,
    transferSize: size,
  };
}

function callsOf(browser: MockBrowser, method: string) {
  return browser.calls.filter((c) => c.method === method);
}

describe("analyseWebFlow", () => {
  let browser: MockBrowser;
  let results: PageAnalysis[][];
  let flow: WebFlowAnalysis | undefined;
  const consume = (pages: PageAnalysis[]) => results.push(pages);
  const last = () => results[results.length - 1];

  const start = async (
    params: Partial<WebFlowAnalysisParams> = {},
    rules: BestPracticeRule<any>[] = [fakeRule]
  ) => {
    flow = await analyseWebFlow(
      browser,
      { ...BASE, ...params },
      consume,
      { ...OPTIONS, rules }
    );
    return flow;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    browser = new MockBrowser({
      pageInfo: { title: "Home", url: "https://www.example.org/", domSize: 100 },
    });
    results = [];
    flow = undefined;
  });

  afterEach(() => {
    flow?.stopAnalysis();
    vi.useRealTimers();
  });

  it("reloads the page before reading network requests when refreshOnStart is set", async () => {
    await start({ refreshOnStart: true });
    const methods = browser.calls.map((c) => c.method);
    expect(methods.indexOf("reloadInspectedPage")).toBeGreaterThanOrEqual(0);
    expect(methods.indexOf("reloadInspectedPage")).toBeLessThan(
      methods.indexOf("getNetworkRequests")
    );
    expect(callsOf(browser, "reloadInspectedPage")[0].args[0]).toEqual({
      purgeCache: true,
    });
  });

  it("does not reload when refreshOnStart is off, and emits the initial page", async () => {
    browser.emitNetworkRequest(request());
    await start();
    expect(callsOf(browser, "reloadInspectedPage")).toHaveLength(0);
    expect(last()).toHaveLength(1);
    expect(last()[0].url).toBe("https://www.example.org/");
    expect(last()[0].requests).toHaveLength(1);
  });

  describe("DOM polling", () => {
    it("samples the page every interval", async () => {
      await start();
      const before = callsOf(browser, "getPageInfo").length;
      await vi.advanceTimersByTimeAsync(3000);
      expect(callsOf(browser, "getPageInfo").length - before).toBe(3);
    });

    it("dedupes equal sizes and tracks the max", async () => {
      await start();
      await vi.advanceTimersByTimeAsync(1000); // 100 again
      expect(last()[0].domProfile).toHaveLength(1);
      browser.setPageInfo({ title: "Home", url: "https://www.example.org/", domSize: 300 });
      await vi.advanceTimersByTimeAsync(1000);
      browser.setPageInfo({ title: "Home", url: "https://www.example.org/", domSize: 200 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(last()[0].domProfile.map((d) => d.domSize)).toEqual([100, 300, 200]);
      expect(last()[0].maxDomSize).toBe(300);
    });

    it("ignores a sample for another URL", async () => {
      await start();
      browser.setPageInfo({ title: "Other", url: "https://www.example.org/other", domSize: 9999 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(last()[0].maxDomSize).toBe(100);
      expect(last()[0].title).toBe("Home");
    });

    it("refreshes the title when the URL matches", async () => {
      await start();
      browser.setPageInfo({ title: "New title", url: "https://www.example.org/", domSize: 100 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(last()[0].title).toBe("New title");
    });

    it("keeps polling after a rejected getPageInfo", async () => {
      await start();
      const original = browser.getPageInfo.bind(browser);
      let fail = true;
      browser.getPageInfo = async () => {
        if (fail) {
          fail = false;
          throw new Error("boom");
        }
        return original();
      };
      vi.spyOn(console, "error").mockImplementation(() => {});
      browser.setPageInfo({ title: "Home", url: "https://www.example.org/", domSize: 500 });
      await vi.advanceTimersByTimeAsync(2000);
      expect(last()[0].maxDomSize).toBe(500);
    });
  });

  describe("navigation", () => {
    it("closes the page on a url-changed to another path", async () => {
      await start();
      browser.setPageInfo({ title: "Page 2", url: "https://www.example.org/two", domSize: 50 });
      browser.emitNavigation({ kind: "url-changed", url: "https://www.example.org/two" });
      await vi.advanceTimersByTimeAsync(0);
      expect(last()).toHaveLength(2);
      expect(last()[1].url).toBe("https://www.example.org/two");
    });

    it("closes the page and opens a new one from event.url when getPageInfo rejects", async () => {
      await start();
      const original = browser.getPageInfo.bind(browser);
      let fail = true;
      browser.getPageInfo = async () => {
        if (fail) throw new Error("frame removed");
        return original();
      };
      vi.spyOn(console, "error").mockImplementation(() => {});
      browser.emitNavigation({ kind: "url-changed", url: "https://www.example.org/two" });
      await vi.advanceTimersByTimeAsync(0);
      expect(last()).toHaveLength(2);
      expect(last()[1].url).toBe("https://www.example.org/two");
      expect(last()[1].title).toBe("");

      fail = false;
      browser.setPageInfo({ title: "Two", url: "https://www.example.org/two", domSize: 70 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(last()[1].title).toBe("Two");
      expect(last()[1].maxDomSize).toBe(70);
      expect(last()[1].domProfile.map((d) => d.domSize)).toEqual([70]);
    });

    it("trusts event.url when getPageInfo still returns the old document", async () => {
      await start();
      // MockBrowser still reports the old URL
      browser.emitNavigation({ kind: "url-changed", url: "https://www.example.org/two" });
      await vi.advanceTimersByTimeAsync(0);
      expect(last()).toHaveLength(2);
      expect(last()[1].url).toBe("https://www.example.org/two");
      expect(last()[1].maxDomSize).toBe(0);

      browser.setPageInfo({ title: "Two", url: "https://www.example.org/two", domSize: 80 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(last()[1].maxDomSize).toBe(80);
      expect(last()[1].title).toBe("Two");
    });

    it("uses event.url for the pending page too when getPageInfo rejects", async () => {
      await start({ triggerNewPageOnLinkClicked: true });
      browser.emitNavigation({ kind: "link-clicked", url: "https://www.example.org/x" });
      await vi.advanceTimersByTimeAsync(0);
      browser.getPageInfo = async () => {
        throw new Error("not ready");
      };
      vi.spyOn(console, "error").mockImplementation(() => {});
      browser.emitNavigation({ kind: "url-changed", url: "https://www.example.org/x" });
      await vi.advanceTimersByTimeAsync(0);
      expect(last()).toHaveLength(2);
      expect(last()[1].url).toBe("https://www.example.org/x");
    });

    it("does not close the page on an anchor change", async () => {
      await start();
      browser.emitNavigation({ kind: "url-changed", url: "https://www.example.org/#section" });
      await vi.advanceTimersByTimeAsync(0);
      expect(last()).toHaveLength(1);
    });

    it("link-clicked closes the page only when the flag is on", async () => {
      await start({ triggerNewPageOnLinkClicked: false });
      browser.emitNavigation({ kind: "link-clicked", url: "https://www.example.org/x" });
      await vi.advanceTimersByTimeAsync(0);
      expect(last()).toHaveLength(1);
      flow!.stopAnalysis();

      await start({ triggerNewPageOnLinkClicked: true });
      browser.emitNavigation({ kind: "link-clicked", url: "https://www.example.org/x" });
      await vi.advanceTimersByTimeAsync(0);
      expect(last()).toHaveLength(2);
      expect(last()[1].url).toBe("(En attente)");
    });

    it("form-submitted closes the page only when ITS flag is on (B6)", async () => {
      await start({ triggerNewPageOnLinkClicked: true, triggerNewPageOnFormSubmitted: false });
      browser.emitNavigation({ kind: "form-submitted", url: "https://www.example.org/x" });
      await vi.advanceTimersByTimeAsync(0);
      expect(last()).toHaveLength(1);
      flow!.stopAnalysis();

      await start({ triggerNewPageOnLinkClicked: false, triggerNewPageOnFormSubmitted: true });
      browser.emitNavigation({ kind: "form-submitted", url: "https://www.example.org/x" });
      await vi.advanceTimersByTimeAsync(0);
      expect(last()).toHaveLength(2);
    });

    it("fills the pending page on the following url-changed", async () => {
      await start({ triggerNewPageOnLinkClicked: true });
      browser.emitNavigation({ kind: "link-clicked", url: "https://www.example.org/x" });
      await vi.advanceTimersByTimeAsync(0);
      browser.setPageInfo({ title: "X", url: "https://www.example.org/x", domSize: 10 });
      browser.emitNavigation({ kind: "url-changed", url: "https://www.example.org/x" });
      await vi.advanceTimersByTimeAsync(0);
      expect(last()).toHaveLength(2);
      expect(last()[1].url).toBe("https://www.example.org/x");
      expect(last()[1].title).toBe("X");
    });

    it("stopCurrentNavigation closes the current page", async () => {
      await start();
      flow!.stopCurrentNavigation();
      expect(last()).toHaveLength(2);
    });
  });

  describe("best practices", () => {
    beforeEach(() => {
      browser.setPageData({ fake: { ok: true, data: 1 } });
    });

    it("collects at start and evaluates the rules on the page", async () => {
      await start({ checkBestPractices: true });
      expect(callsOf(browser, "collectPageData")).toHaveLength(1);
      expect(callsOf(browser, "collectPageData")[0].args[0]).toEqual(["fake"]);
      const bp = last()[0].bestPractices!;
      expect(bp).toHaveLength(1);
      expect(bp[0]).toMatchObject({ id: "fake", compliance: "A", detail: "page=1" });
    });

    it("does not re-collect before collectMinIntervalMs even on a big DOM change", async () => {
      await start({ checkBestPractices: true });
      browser.setPageInfo({ title: "Home", url: "https://www.example.org/", domSize: 1000 });
      await vi.advanceTimersByTimeAsync(3000);
      expect(callsOf(browser, "collectPageData")).toHaveLength(1);
    });

    it("does not re-collect after the interval when the DOM did not change significantly", async () => {
      await start({ checkBestPractices: true });
      browser.setPageInfo({ title: "Home", url: "https://www.example.org/", domSize: 105 });
      await vi.advanceTimersByTimeAsync(7000);
      expect(callsOf(browser, "collectPageData")).toHaveLength(1);
    });

    it("re-collects after a significant DOM change once the interval has passed", async () => {
      await start({ checkBestPractices: true });
      browser.setPageInfo({ title: "Home", url: "https://www.example.org/", domSize: 400 });
      await vi.advanceTimersByTimeAsync(6000);
      expect(callsOf(browser, "collectPageData")).toHaveLength(2);
    });

    it("resets pageData on a new page", async () => {
      await start({ checkBestPractices: true, triggerNewPageOnLinkClicked: true });
      // the link click triggers a best-effort collection on the old page
      browser.emitNavigation({ kind: "link-clicked", url: "https://www.example.org/x" });
      await vi.advanceTimersByTimeAsync(0);
      expect(last()).toHaveLength(2);
      // pending page: nothing collected yet, rule sees page undefined
      expect(last()[1].bestPractices![0]).toMatchObject({ compliance: "C", detail: "page=undefined" });
      expect(last()[0].bestPractices![0].compliance).toBe("A");
    });

    it("collects best effort before closing on link-clicked, and survives a failure", async () => {
      await start({ checkBestPractices: true, triggerNewPageOnLinkClicked: true });
      browser.collectPageData = async () => {
        throw new Error("page gone");
      };
      vi.spyOn(console, "error").mockImplementation(() => {});
      browser.emitNavigation({ kind: "link-clicked", url: "https://www.example.org/x" });
      await vi.advanceTimersByTimeAsync(0);
      expect(last()).toHaveLength(2);
    });

    it("collects nothing when the option is off", async () => {
      await start({ checkBestPractices: false });
      await vi.advanceTimersByTimeAsync(10000);
      expect(callsOf(browser, "collectPageData")).toHaveLength(0);
      expect(last()[0].bestPractices).toEqual([]);
    });
  });

  describe("stopAnalysis", () => {
    it("stops polling, closes listeners and is idempotent", async () => {
      await start({ triggerNewPageOnLinkClicked: true });
      flow!.stopAnalysis();
      flow!.stopAnalysis();
      const polls = callsOf(browser, "getPageInfo").length;
      const emitted = results.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(callsOf(browser, "getPageInfo").length).toBe(polls);

      browser.emitNetworkRequest(request());
      browser.emitNavigation({ kind: "link-clicked", url: "https://www.example.org/x" });
      await vi.advanceTimersByTimeAsync(0);
      expect(results.length).toBe(emitted);
    });

    it("logs once at start and once at stop", async () => {
      await start();
      await vi.advanceTimersByTimeAsync(3000);
      flow!.stopAnalysis();
      flow!.stopAnalysis();
      expect(callsOf(browser, "log")).toHaveLength(2);
    });
  });

  it("appends network requests to the current page", async () => {
    await start();
    browser.emitNetworkRequest(request("/a.js", 2000));
    expect(last()[0].requests).toHaveLength(1);
    expect(last()[0].requestSizeInKb).toBe(2);
  });

  it("US-025 scenario 5: LimitRequests counts exactly the page's Requêtes column", async () => {
    browser.emitNetworkRequest(request("/a.js"));
    browser.emitNetworkRequest(request("/a.js"));
    browser.emitNetworkRequest({ ...request("/missing.js"), code: 404 });
    await start({ checkBestPractices: true }, [limitRequestsRule]);
    browser.emitNetworkRequest(request("/b.js"));
    await vi.advanceTimersByTimeAsync(0);
    const page = last()[0];
    expect(page.requests).toHaveLength(4);
    const bp = page.bestPractices!.find((b) => b.id === "LimitRequests")!;
    expect(bp.detail).toBe(`${page.requests.length} requêtes HTTP`);
  });
});
