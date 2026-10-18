import { describe, expect, it } from "vitest";
import { NavigationEvent } from "../domain/models/navigation-event";
import { NetworkRequest } from "../domain/models/network-request";
import { MockBrowser } from "./mock-browser";

const req = (path: string): NetworkRequest => ({
  method: "GET",
  url: new URL("https://x.org/" + path),
  code: 200,
  type: "text/css",
  responseSize: 1,
  transferSize: 1,
});

describe("MockBrowser", () => {
  it("returns defaults and honours initial values", async () => {
    const b = new MockBrowser({
      pageInfo: { title: "T", url: "https://t", domSize: 7 },
      requests: [req("a")],
      permission: false,
      pageData: { r: { ok: true, data: 1 } },
    });
    expect(await b.checkPermission()).toBe(false);
    expect((await b.getPageInfo()).domSize).toBe(7);
    expect(await b.getNetworkRequests()).toHaveLength(1);
    expect(await b.collectPageData(["r", "unknown"])).toEqual({ r: { ok: true, data: 1 } });
    expect((await new MockBrowser().getPageDescription()).name).toBeTruthy();
    expect(await new MockBrowser().checkPermission()).toBe(true);
  });

  it("setPageInfo and setPageData change later results", async () => {
    const b = new MockBrowser();
    b.setPageInfo({ title: "N", url: "u", domSize: 99 });
    b.setPageData({ a: { ok: false, error: "e" } });
    expect((await b.getPageInfo()).domSize).toBe(99);
    expect(await b.collectPageData(["a"])).toEqual({ a: { ok: false, error: "e" } });
  });

  it("emitNetworkRequest notifies listeners, stores the request, and close() unsubscribes", async () => {
    const b = new MockBrowser();
    const got: string[] = [];
    const c = b.onNetworkRequest((r) => got.push(r.url.pathname));
    b.emitNetworkRequest(req("a"));
    c.close();
    b.emitNetworkRequest(req("b"));
    expect(got).toEqual(["/a"]);
    expect(await b.getNetworkRequests()).toHaveLength(2);
  });

  it("emitNavigation notifies listeners and close() unsubscribes", () => {
    const b = new MockBrowser();
    const got: NavigationEvent[] = [];
    const c = b.onNavigation((e) => got.push(e));
    b.emitNavigation({ kind: "url-changed", url: "u1" });
    c.close();
    b.emitNavigation({ kind: "link-clicked", url: "u2" });
    expect(got).toEqual([{ kind: "url-changed", url: "u1" }]);
  });

  it("records calls, resolves reload immediately", async () => {
    const b = new MockBrowser();
    await b.reloadInspectedPage({ purgeCache: true });
    await b.openUrlInNewTab("https://z");
    b.log("hi");
    await b.getPageInfo();
    expect(b.calls).toEqual([
      { method: "reloadInspectedPage", args: [{ purgeCache: true }] },
      { method: "openUrlInNewTab", args: ["https://z"] },
      { method: "log", args: ["hi"] },
      { method: "getPageInfo", args: [] },
    ]);
  });
});
