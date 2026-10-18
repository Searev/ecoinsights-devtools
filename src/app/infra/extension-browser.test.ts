import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentError,
  AGENT_PORT_NAME,
  AgentRequestMessage,
  FromAgentMessage,
} from "../../shared/protocol";
import { NavigationEvent } from "../domain/models/navigation-event";
import {
  DevtoolsLike,
  ExtensionBrowser,
  PortLike,
} from "./extension-browser";

class FakePort implements PortLike {
  sent: AgentRequestMessage[] = [];
  private messageListeners: Array<(m: FromAgentMessage) => void> = [];
  private disconnectListeners: Array<() => void> = [];
  onMessage = {
    addListener: (l: (m: FromAgentMessage) => void) => {
      this.messageListeners.push(l);
    },
  };
  onDisconnect = {
    addListener: (l: () => void) => {
      this.disconnectListeners.push(l);
    },
  };
  postMessage(message: unknown) {
    this.sent.push(message as AgentRequestMessage);
  }
  emit(message: FromAgentMessage) {
    this.messageListeners.forEach((l) => l(message));
  }
  disconnect() {
    this.disconnectListeners.forEach((l) => l());
  }
  last() {
    return this.sent[this.sent.length - 1];
  }
  ok(id: string, result: unknown) {
    this.emit({ type: "response", id, ok: true, result });
  }
}

class FakeDevtools implements DevtoolsLike {
  inspectedWindow = { tabId: 42 };
  harEntries: any[] = [];
  harStyle: "callback" | "promise" = "callback";
  finishedListeners: Array<(e: any) => void> = [];
  network = {
    getHAR: (cb?: (har: any) => void): any => {
      const har = { entries: this.harEntries };
      if (this.harStyle === "promise") return Promise.resolve(har);
      cb?.(har);
      return undefined;
    },
    onRequestFinished: {
      addListener: (l: (e: any) => void) => {
        this.finishedListeners.push(l);
      },
      removeListener: (l: (e: any) => void) => {
        this.finishedListeners = this.finishedListeners.filter((x) => x !== l);
      },
    },
  };
}

function harEntry(url: string): any {
  return {
    request: { method: "GET", url },
    response: {
      status: 200,
      headers: [],
      bodySize: 1,
      headersSize: 1,
      content: { size: 10, mimeType: "text/css" },
      _transferSize: 5,
    },
  };
}

function setup() {
  const ports: FakePort[] = [];
  const connectInfos: Array<{ name: string }> = [];
  const devtools = new FakeDevtools();
  const browser = new ExtensionBrowser({
    runtime: {
      connect: (info) => {
        connectInfos.push(info);
        const p = new FakePort();
        ports.push(p);
        return p;
      },
    },
    devtools,
  });
  return { ports, connectInfos, devtools, browser };
}

describe("ExtensionBrowser RPC", () => {
  it("sends the tabId, a unique id, and resolves with the matching response", async () => {
    const { ports, connectInfos, browser } = setup();
    const p1 = browser.checkPermission();
    const p2 = browser.checkPermission();
    const port = ports[0];
    expect(connectInfos[0].name).toBe(AGENT_PORT_NAME);
    expect(port.sent).toHaveLength(2);
    expect(port.sent[0]).toMatchObject({
      type: "request",
      tabId: 42,
      method: "permission.check",
    });
    expect(port.sent[0].id).not.toBe(port.sent[1].id);
    port.ok(port.sent[0].id, true);
    port.ok(port.sent[1].id, false);
    await expect(p1).resolves.toBe(true);
    await expect(p2).resolves.toBe(false);
  });

  it("resolves concurrent calls independently in reverse order", async () => {
    const { ports, browser } = setup();
    const info = browser.getPageInfo();
    const desc = browser.getPageDescription();
    const port = ports[0];
    const [infoReq, descReq] = port.sent;
    expect(infoReq.method).toBe("page.info");
    expect(descReq.method).toBe("page.description");
    port.ok(descReq.id, { name: "n", description: "d", url: "u" });
    await expect(desc).resolves.toEqual({ name: "n", description: "d", url: "u" });
    port.ok(infoReq.id, { title: "t", url: "u", domSize: 3 });
    await expect(info).resolves.toEqual({ title: "t", url: "u", domSize: 3 });
  });

  it("rejects with an AgentError carrying the code on ok:false", async () => {
    const { ports, browser } = setup();
    const p = browser.getPageInfo();
    const port = ports[0];
    port.emit({
      type: "response",
      id: port.last().id,
      ok: false,
      error: { code: "NO_PERMISSION", message: "nope" },
    });
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(AgentError);
    expect(err).toMatchObject({ code: "NO_PERMISSION", message: "nope" });
  });

  it("maps the other methods onto protocol methods", async () => {
    const { ports, browser } = setup();
    const collect = browser.collectPageData(["a", "b"]);
    const port = ports[0];
    expect(port.last()).toMatchObject({ method: "page.collect", params: { ruleIds: ["a", "b"] } });
    port.ok(port.last().id, { a: { ok: true, data: 1 } });
    await expect(collect).resolves.toEqual({ a: { ok: true, data: 1 } });

    const open = browser.openUrlInNewTab("https://x.org");
    expect(port.last()).toMatchObject({ method: "tab.open", params: { url: "https://x.org" } });
    port.ok(port.last().id, undefined);
    await open;

    browser.log("hello");
    expect(port.last()).toMatchObject({ method: "page.log", params: { message: "hello" } });
  });

  it("log() swallows errors", async () => {
    const { ports, browser } = setup();
    browser.log("x");
    const port = ports[0];
    port.emit({
      type: "response",
      id: port.last().id,
      ok: false,
      error: { code: "INTERNAL", message: "boom" },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(true).toBe(true); // no unhandled rejection (vitest would fail the run)
  });

  describe("timeouts", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("rejects with TIMEOUT after 5 s and ignores a late response", async () => {
      const { ports, browser } = setup();
      const p = browser.getPageInfo();
      const caught = p.catch((e) => e);
      const port = ports[0];
      const id = port.last().id;
      await vi.advanceTimersByTimeAsync(4_999);
      let settled = false;
      void p.then(() => (settled = true), () => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const err = await caught;
      expect(err).toBeInstanceOf(AgentError);
      expect(err.code).toBe("TIMEOUT");
      expect(() => port.ok(id, { title: "t", url: "u", domSize: 1 })).not.toThrow();
    });

    it("waits 30 s for page.reload", async () => {
      const { ports, browser } = setup();
      const p = browser.reloadInspectedPage({ purgeCache: true });
      const caught = p.catch((e) => e);
      const port = ports[0];
      expect(port.last()).toMatchObject({ method: "page.reload", params: { purgeCache: true } });
      await vi.advanceTimersByTimeAsync(29_999);
      let settled = false;
      void caught.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect((await caught).code).toBe("TIMEOUT");
    });

    it("does not time out once answered", async () => {
      const { ports, browser } = setup();
      const p = browser.checkPermission();
      ports[0].ok(ports[0].last().id, true);
      await expect(p).resolves.toBe(true);
      await vi.advanceTimersByTimeAsync(60_000);
    });
  });

  describe("disconnect", () => {
    it("rejects pending calls with DISCONNECTED and reconnects on next call", async () => {
      const { ports, browser } = setup();
      const p = browser.getPageInfo();
      const caught = p.catch((e) => e);
      ports[0].disconnect();
      const err = await caught;
      expect(err).toBeInstanceOf(AgentError);
      expect(err.code).toBe("DISCONNECTED");
      expect(ports).toHaveLength(1);

      const next = browser.checkPermission();
      expect(ports).toHaveLength(2);
      ports[1].ok(ports[1].last().id, true);
      await expect(next).resolves.toBe(true);
    });

    it("reconnects immediately and re-sends navigation.watch when listeners exist", async () => {
      const { ports, browser } = setup();
      browser.onNavigation(() => {});
      expect(ports[0].last()).toMatchObject({ method: "navigation.watch", params: { enabled: true } });
      ports[0].disconnect();
      expect(ports).toHaveLength(2);
      expect(ports[1].last()).toMatchObject({ method: "navigation.watch", params: { enabled: true } });
    });

    it("does not reconnect immediately without navigation listeners", () => {
      const { ports, browser } = setup();
      void browser.checkPermission().catch(() => {});
      ports[0].disconnect();
      expect(ports).toHaveLength(1);
    });
  });

  describe("onNavigation", () => {
    it("watches on first listener, unwatches after the last, and dispatches events", () => {
      const { ports, browser } = setup();
      const a: NavigationEvent[] = [];
      const b: NavigationEvent[] = [];
      const ca = browser.onNavigation((e) => a.push(e));
      const port = ports[0];
      expect(port.sent).toHaveLength(1);
      const cb = browser.onNavigation((e) => b.push(e));
      expect(port.sent).toHaveLength(1);

      const event: NavigationEvent = { kind: "url-changed", url: "https://x.org" };
      port.emit({ type: "event", event });
      expect(a).toEqual([event]);
      expect(b).toEqual([event]);

      ca.close();
      expect(port.sent).toHaveLength(1);
      port.emit({ type: "event", event });
      expect(a).toHaveLength(1);
      expect(b).toHaveLength(2);

      cb.close();
      expect(port.sent).toHaveLength(2);
      expect(port.last()).toMatchObject({ method: "navigation.watch", params: { enabled: false } });
      cb.close();
      expect(port.sent).toHaveLength(2);
    });
  });

  describe("network", () => {
    it("getNetworkRequests supports callback-style getHAR and filters data: entries", async () => {
      const { devtools, browser } = setup();
      devtools.harEntries = [harEntry("https://a.org/x"), harEntry("data:text/plain,hi")];
      const res = await browser.getNetworkRequests();
      expect(res.map((r) => r.url.href)).toEqual(["https://a.org/x"]);
    });

    it("getNetworkRequests supports Promise-style getHAR", async () => {
      const { devtools, browser } = setup();
      devtools.harStyle = "promise";
      devtools.harEntries = [harEntry("https://a.org/x"), harEntry("blob:https://a.org/1")];
      const res = await browser.getNetworkRequests();
      expect(res).toHaveLength(1);
      expect(res[0].transferSize).toBe(5);
    });

    it("onNetworkRequest maps entries, skips non-http and unsubscribes on close", () => {
      const { devtools, browser } = setup();
      const got: string[] = [];
      const c = browser.onNetworkRequest((r) => got.push(r.url.href));
      devtools.finishedListeners.forEach((l) => l(harEntry("https://a.org/y")));
      devtools.finishedListeners.forEach((l) => l(harEntry("data:text/plain,hi")));
      expect(got).toEqual(["https://a.org/y"]);
      c.close();
      expect(devtools.finishedListeners).toHaveLength(0);
    });
  });
});
