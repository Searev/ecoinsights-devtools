import { describe, expect, it } from "vitest";
import { AGENT_PORT_NAME } from "../shared/protocol";
import type { BestPracticeRule } from "../app/domain/best-practices/rule";
import { createPageAgent } from "./page-agent";
import { createFakeChrome } from "./testing/fake-chrome";

const flush = () => new Promise((r) => setTimeout(r, 0));

function rule(id: string, collect?: () => unknown): BestPracticeRule<any> {
  return {
    id: id as any,
    name: id,
    category: "Conception" as any,
    collect,
    evaluate: () => ({ compliance: "A" as any, detail: "" }),
  };
}

function setup(rules: BestPracticeRule<any>[] = []) {
  const fake = createFakeChrome();
  const agent = createPageAgent({ chrome: fake.chrome, rules });
  const port = fake.connect(AGENT_PORT_NAME);
  return { fake, agent, port };
}

describe("page agent: request/response", () => {
  it("answers page.info and page.description with the same id and the executeScript result", async () => {
    const { fake, port } = setup();
    fake.state.executeHandler = (inj) =>
      inj.args?.length === 0 && String(inj.func).includes("domSize")
        ? { title: "T", url: "https://a.b/", domSize: 3 }
        : { name: "N", description: "D", url: "https://a.b" };

    const info = await port.request("i1", 7, "page.info");
    const desc = await port.request("d1", 7, "page.description");

    expect(info).toEqual({
      type: "response",
      id: "i1",
      ok: true,
      result: { title: "T", url: "https://a.b/", domSize: 3 },
    });
    expect(desc).toMatchObject({ id: "d1", ok: true });
    expect(fake.executed[0].target).toEqual({ tabId: 7 });
  });

  it("gives concurrent requests of the same method their own answers", async () => {
    const { fake, port } = setup();
    let n = 0;
    fake.state.executeHandler = async () => {
      const mine = ++n;
      await new Promise((r) => setTimeout(r, mine === 1 ? 20 : 0));
      return { title: `t${mine}`, url: "", domSize: mine };
    };

    const [a, b] = await Promise.all([
      port.request("a", 1, "page.info"),
      port.request("b", 1, "page.info"),
    ]);

    expect(a.result.title).toBe("t1");
    expect(b.result.title).toBe("t2");
  });

  it("maps a 'Cannot access contents' failure to NO_PERMISSION", async () => {
    const { fake, port } = setup();
    fake.state.executeHandler = () => {
      throw new Error("Cannot access contents of url \"https://x\"");
    };
    const res = await port.request("1", 1, "page.info");
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("NO_PERMISSION");
  });

  it("maps an unknown method to UNKNOWN_METHOD and other failures to INTERNAL", async () => {
    const { fake, port } = setup();
    const unknown = await port.request("1", 1, "nope");
    expect(unknown.error.code).toBe("UNKNOWN_METHOD");

    fake.state.executeHandler = () => {
      throw new Error("boom");
    };
    const internal = await port.request("2", 1, "page.info");
    expect(internal.error).toEqual({ code: "INTERNAL", message: "boom" });
  });

  it("ignores ports with another name", async () => {
    const fake = createFakeChrome();
    createPageAgent({ chrome: fake.chrome, rules: [] });
    const other = fake.connect("something-else");
    other.send({ type: "request", id: "1", tabId: 1, method: "page.info" });
    await flush();
    expect(other.sent).toEqual([]);
    expect(other.onMessage.listeners.size).toBe(0);
  });
});

describe("page agent: permission.check", () => {
  it("asks permissions.contains for the origin of an https tab", async () => {
    const { fake, port } = setup();
    fake.state.tabs.set(1, { id: 1, url: "https://example.com/a/b?x=1" });
    const res = await port.request("1", 1, "permission.check");
    expect(res.result).toBe(true);
    expect(fake.state.permissionsContains).toEqual([
      { origins: ["https://example.com/*"] },
    ]);
  });

  it("returns false without calling contains for chrome:// pages", async () => {
    const { fake, port } = setup();
    fake.state.tabs.set(1, { id: 1, url: "chrome://extensions" });
    const res = await port.request("1", 1, "permission.check");
    expect(res.result).toBe(false);
    expect(fake.state.permissionsContains).toEqual([]);
  });
});

describe("page agent: page.collect", () => {
  it("runs one collector per collectable rule, isolates failures, omits unknown and collector-less ids", async () => {
    const good = () => 42;
    const bad = () => 0;
    const { fake, port } = setup([
      rule("good", good),
      rule("bad", bad),
      rule("undef", () => 1),
      rule("nocollect"),
    ]);
    fake.state.executeHandler = (inj) => {
      if (inj.func === bad) throw new Error("kaboom");
      if (String(inj.func) === String(good)) return 42;
      return undefined;
    };

    const res = await port.request("1", 3, "page.collect", {
      ruleIds: ["good", "bad", "undef", "nocollect", "missing"],
    });

    expect(res.result).toEqual({
      good: { ok: true, data: 42 },
      bad: { ok: false, error: "kaboom" },
      undef: { ok: false, error: expect.any(String) },
    });
    expect(fake.executed).toHaveLength(3);
  });
});

describe("page agent: page.reload", () => {
  it("resolves only on status complete for that tab", async () => {
    const { fake, port } = setup();
    let done = false;
    const p = port.request("1", 5, "page.reload", { purgeCache: false }).then(() => {
      done = true;
    });
    await flush();
    expect(fake.state.reloads).toEqual([{ tabId: 5, options: { bypassCache: true } }]);

    fake.onUpdated.emit(9, { status: "complete" }, {});
    fake.onUpdated.emit(5, { status: "loading" }, {});
    await flush();
    expect(done).toBe(false);

    fake.onUpdated.emit(5, { status: "complete" }, {});
    await p;
    expect(done).toBe(true);
    expect(fake.onUpdated.listeners.size).toBe(0);
  });

  it("registers the listener before reloading", async () => {
    const { fake, port } = setup();
    let listenersAtReload = -1;
    const original = fake.chrome.tabs.reload;
    fake.chrome.tabs.reload = async (...a) => {
      listenersAtReload = fake.onUpdated.listeners.size;
      return original(...a);
    };
    const p = port.request("1", 5, "page.reload", { purgeCache: false });
    await flush();
    fake.onUpdated.emit(5, { status: "complete" }, {});
    await p;
    expect(listenersAtReload).toBe(1);
  });

  it("purges cache without removing downloads", async () => {
    const { fake, port } = setup();
    const p = port.request("1", 5, "page.reload", { purgeCache: true });
    await flush();
    fake.onUpdated.emit(5, { status: "complete" }, {});
    await p;
    const call = fake.state.browsingDataCalls[0];
    expect(call.types).toEqual({ cache: true, serviceWorkers: true });
    expect(call.types).not.toHaveProperty("downloads");
  });

  it("does not purge when purgeCache is false", async () => {
    const { fake, port } = setup();
    const p = port.request("1", 5, "page.reload", { purgeCache: false });
    await flush();
    fake.onUpdated.emit(5, { status: "complete" }, {});
    await p;
    expect(fake.state.browsingDataCalls).toEqual([]);
  });
});

describe("page agent: page.log and tab.open", () => {
  it("logs with the EcoInsights prefix and opens tabs", async () => {
    const { fake, port } = setup();
    fake.state.executeHandler = () => undefined;
    await port.request("1", 2, "page.log", { message: "hi" });
    expect(fake.executed[0].args).toEqual(["hi"]);
    const logs: string[] = [];
    const spy = console.log;
    console.log = (m: string) => logs.push(m);
    try {
      fake.executed[0].func!("hi");
    } finally {
      console.log = spy;
    }
    expect(logs).toEqual(["EcoInsights : hi"]);

    await port.request("2", 2, "tab.open", { url: "https://x.y" });
    expect(fake.state.created).toEqual([{ url: "https://x.y" }]);
  });
});

describe("page agent: navigation.watch", () => {
  const probeMsg = {
    source: "ecoinsights-probe",
    event: { kind: "link-clicked", url: "https://a.b/next" },
  };

  it("injects the probe in the top frame and forwards url-changed", async () => {
    const { fake, port } = setup();
    await port.request("1", 4, "navigation.watch", { enabled: true });
    expect(fake.executed[0]).toMatchObject({
      target: { tabId: 4 },
      files: ["scripts/probe.js"],
    });
    expect(fake.executed[0].target).not.toHaveProperty("allFrames");

    fake.onUpdated.emit(4, { url: "https://a.b/p2" }, {});
    fake.onUpdated.emit(8, { url: "https://other" }, {});
    expect(port.events).toEqual([
      { type: "event", event: { kind: "url-changed", url: "https://a.b/p2" } },
    ]);
  });

  it("re-injects the probe on complete for the session tab only", async () => {
    const { fake, port } = setup();
    await port.request("1", 4, "navigation.watch", { enabled: true });
    fake.onUpdated.emit(8, { status: "complete" }, {});
    await flush();
    expect(fake.executed).toHaveLength(1);
    fake.onUpdated.emit(4, { status: "complete" }, {});
    await flush();
    expect(fake.executed).toHaveLength(2);
  });

  it("is idempotent when enabled twice", async () => {
    const { fake, port } = setup();
    await port.request("1", 4, "navigation.watch", { enabled: true });
    await port.request("2", 4, "navigation.watch", { enabled: true });
    expect(fake.onUpdated.listeners.size).toBe(1);
    expect(fake.onMessage.listeners.size).toBe(1);
  });

  it("forwards probe messages only for the matching tab and top frame", async () => {
    const { fake, port } = setup();
    await port.request("1", 4, "navigation.watch", { enabled: true });
    fake.onMessage.emit(probeMsg, { tab: { id: 4 }, frameId: 0 });
    fake.onMessage.emit(probeMsg, { tab: { id: 4 } });
    fake.onMessage.emit(probeMsg, { tab: { id: 9 }, frameId: 0 });
    fake.onMessage.emit(probeMsg, { tab: { id: 4 }, frameId: 3 });
    fake.onMessage.emit({ junk: true }, { tab: { id: 4 }, frameId: 0 });
    expect(port.events).toHaveLength(2);
    expect(port.events[0].event).toEqual(probeMsg.event);
  });

  it("forwards nothing after enabled:false", async () => {
    const { fake, port } = setup();
    await port.request("1", 4, "navigation.watch", { enabled: true });
    await port.request("2", 4, "navigation.watch", { enabled: false });
    fake.onUpdated.emit(4, { url: "https://a.b/p2" }, {});
    fake.onMessage.emit(probeMsg, { tab: { id: 4 }, frameId: 0 });
    expect(port.events).toEqual([]);
    expect(fake.onUpdated.listeners.size).toBe(0);
    expect(fake.onMessage.listeners.size).toBe(0);
  });

  it("uses a custom probe file", async () => {
    const fake = createFakeChrome();
    createPageAgent({ chrome: fake.chrome, rules: [], probeFile: "p.js" });
    const port = fake.connect(AGENT_PORT_NAME);
    await port.request("1", 4, "navigation.watch", { enabled: true });
    expect(fake.executed[0].files).toEqual(["p.js"]);
  });
});

describe("page agent: sessions", () => {
  it("removes every listener of a session on port disconnect", async () => {
    const { fake, port } = setup();
    await port.request("1", 4, "navigation.watch", { enabled: true });
    expect(fake.onUpdated.listeners.size).toBe(1);
    port.disconnect();
    expect(fake.onUpdated.listeners.size).toBe(0);
    expect(fake.onMessage.listeners.size).toBe(0);
    expect(port.onMessage.listeners.size).toBe(0);
  });

  it("keeps the other session working when one port closes", async () => {
    const fake = createFakeChrome();
    createPageAgent({ chrome: fake.chrome, rules: [] });
    const p1 = fake.connect(AGENT_PORT_NAME);
    const p2 = fake.connect(AGENT_PORT_NAME);
    await p1.request("1", 1, "navigation.watch", { enabled: true });
    await p2.request("1", 2, "navigation.watch", { enabled: true });
    p1.disconnect();

    fake.onUpdated.emit(1, { url: "https://one" }, {});
    fake.onUpdated.emit(2, { url: "https://two" }, {});
    expect(p1.events).toEqual([]);
    expect(p2.events).toEqual([
      { type: "event", event: { kind: "url-changed", url: "https://two" } },
    ]);
  });

  it("dispose() disconnects from runtime.onConnect and closes sessions", async () => {
    const { fake, agent, port } = setup();
    await port.request("1", 4, "navigation.watch", { enabled: true });
    agent.dispose();
    expect(fake.onConnect.listeners.size).toBe(0);
    expect(fake.onUpdated.listeners.size).toBe(0);
  });
});
