import type { BestPracticeRule, CollectOutcome } from "../app/domain/best-practices/rule";
import type { Closeable } from "../app/domain/models/closeable";
import type { PageDescription } from "../app/domain/models/page-description";
import type { PageInfos } from "../app/domain/models/page-infos";
import {
  AGENT_PORT_NAME,
  isProbeMessage,
  type AgentErrorCode,
  type AgentEventMessage,
  type AgentMethod,
  type AgentParams,
  type AgentRequestMessage,
  type AgentResponseMessage,
  type AgentResult,
} from "../shared/protocol";
import type { ChromeLike, PortLike } from "./chrome-like";

const DEFAULT_PROBE_FILE = "scripts/probe.js";
const NO_PERMISSION_REGEX = /cannot access|missing host permission|permission/i;

export interface PageAgentDeps {
  chrome: ChromeLike;
  rules: readonly BestPracticeRule<any>[];
  probeFile?: string;
}

type Handlers = {
  [M in AgentMethod]: (tabId: number, params: AgentParams<M>) => Promise<AgentResult<M>>;
};

class AgentFailure extends Error {
  constructor(public readonly code: AgentErrorCode, message: string) {
    super(message);
  }
}

// Page functions below run in the inspected page: they must stay self-contained.
const pageInfoFunc = (): PageInfos => ({
  title: document.title,
  url: location.href,
  domSize: document.querySelectorAll("*:not(svg *)").length,
});

const pageDescriptionFunc = (): PageDescription => ({
  name: document.title,
  description:
    (document.querySelector('meta[name="description"]') as HTMLMetaElement | null)
      ?.content ?? "",
  url: location.origin,
});

const logFunc = (msg: string) => console.log("EcoInsights : " + msg);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createPageAgent(deps: PageAgentDeps): Closeable & { dispose(): void } {
  const { chrome, rules } = deps;
  const probeFile = deps.probeFile ?? DEFAULT_PROBE_FILE;
  const sessions = new Set<Session>();

  async function run<T>(tabId: number, func: () => T): Promise<T>;
  async function run<T, A>(tabId: number, func: (a: A) => T, args: [A]): Promise<T>;
  async function run(tabId: number, func: (...a: any[]) => unknown, args: unknown[] = []) {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
    return res?.result;
  }

  function injectProbe(tabId: number) {
    return chrome.scripting.executeScript({ target: { tabId }, files: [probeFile] });
  }

  class Session {
    tabId: number | undefined;
    private watching: Closeable | undefined;

    constructor(readonly port: PortLike) {}

    private push(event: AgentEventMessage["event"]) {
      this.port.postMessage({ type: "event", event } satisfies AgentEventMessage);
    }

    async setWatch(tabId: number, enabled: boolean) {
      if (!enabled) {
        this.stopWatching();
        return;
      }
      if (this.watching != null) return;

      const onUpdated = (updatedTabId: number, changeInfo: { url?: string; status?: string }) => {
        if (updatedTabId !== tabId) return;
        if (changeInfo.url) this.push({ kind: "url-changed", url: changeInfo.url });
        if (changeInfo.status === "complete") injectProbe(tabId).catch(() => undefined);
      };
      const onMessage = (
        message: unknown,
        sender: { tab?: { id?: number }; frameId?: number }
      ) => {
        if (!isProbeMessage(message)) return;
        if (sender.tab?.id !== tabId) return;
        if (sender.frameId != null && sender.frameId !== 0) return;
        this.push(message.event);
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.runtime.onMessage.addListener(onMessage);
      this.watching = {
        close: () => {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          chrome.runtime.onMessage.removeListener(onMessage);
        },
      };
      await injectProbe(tabId);
    }

    private stopWatching() {
      this.watching?.close();
      this.watching = undefined;
    }

    dispose() {
      this.stopWatching();
    }
  }

  const handlersFor = (session: Session): Handlers => ({
    "permission.check": async (tabId) => {
      const tab = await chrome.tabs.get(tabId);
      let url: URL;
      try {
        url = new URL(tab.url ?? "");
      } catch {
        return false;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      return chrome.permissions.contains({ origins: [`${url.origin}/*`] });
    },
    "page.info": (tabId) => run(tabId, pageInfoFunc),
    "page.description": (tabId) => run(tabId, pageDescriptionFunc),
    "page.collect": async (tabId, { ruleIds }) => {
      const collectable = ruleIds
        .map((id) => rules.find((r) => r.id === id))
        .filter((r): r is BestPracticeRule<any> & { collect: () => unknown } => r?.collect != null);
      const settled = await Promise.allSettled(collectable.map((r) => run(tabId, r.collect)));
      const out: Record<string, CollectOutcome> = {};
      collectable.forEach((rule, i) => {
        const s = settled[i];
        if (s.status === "rejected") {
          out[rule.id] = { ok: false, error: errorMessage(s.reason) };
        } else if (s.value === undefined) {
          out[rule.id] = { ok: false, error: "Collector returned no result" };
        } else {
          out[rule.id] = { ok: true, data: s.value };
        }
      });
      return out;
    },
    "page.reload": async (tabId, { purgeCache }) => {
      if (purgeCache) {
        await chrome.browsingData.remove({ since: 0 }, { cache: true, serviceWorkers: true });
      }
      let listener!: Parameters<ChromeLike["tabs"]["onUpdated"]["addListener"]>[0];
      const complete = new Promise<void>((resolve) => {
        listener = (updatedTabId, changeInfo) => {
          if (updatedTabId === tabId && changeInfo.status === "complete") resolve();
        };
      });
      chrome.tabs.onUpdated.addListener(listener);
      try {
        await chrome.tabs.reload(tabId, { bypassCache: true });
        await complete;
      } finally {
        chrome.tabs.onUpdated.removeListener(listener);
      }
    },
    "page.log": async (tabId, { message }) => {
      await run(tabId, logFunc, [message]);
    },
    "tab.open": async (_tabId, { url }) => {
      await chrome.tabs.create({ url });
    },
    "navigation.watch": (tabId, { enabled }) => session.setWatch(tabId, enabled),
  });

  async function respond(session: Session, handlers: Handlers, request: AgentRequestMessage) {
    let response: AgentResponseMessage;
    try {
      const handler = (handlers as Record<string, unknown>)[request.method] as
        | ((tabId: number, params: unknown) => Promise<unknown>)
        | undefined;
      if (handler == null) {
        throw new AgentFailure("UNKNOWN_METHOD", `Unknown method: ${String(request.method)}`);
      }
      session.tabId ??= request.tabId;
      const result = await handler(request.tabId, request.params);
      response = { type: "response", id: request.id, ok: true, result };
    } catch (error) {
      const message = errorMessage(error);
      const code: AgentErrorCode =
        error instanceof AgentFailure
          ? error.code
          : NO_PERMISSION_REGEX.test(message)
          ? "NO_PERMISSION"
          : "INTERNAL";
      response = { type: "response", id: request.id, ok: false, error: { code, message } };
    }
    session.port.postMessage(response);
  }

  const onConnect = (port: PortLike) => {
    if (port.name !== AGENT_PORT_NAME) return;
    const session = new Session(port);
    sessions.add(session);
    const handlers = handlersFor(session);

    const onMessage = (message: unknown) => {
      const m = message as Partial<AgentRequestMessage> | null;
      if (m?.type !== "request" || typeof m.id !== "string") return;
      void respond(session, handlers, m as AgentRequestMessage);
    };
    const onDisconnect = () => {
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      session.dispose();
      sessions.delete(session);
    };
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
  };

  chrome.runtime.onConnect.addListener(onConnect);

  const dispose = () => {
    chrome.runtime.onConnect.removeListener(onConnect);
    sessions.forEach((s) => s.dispose());
    sessions.clear();
  };
  return { dispose, close: dispose };
}
