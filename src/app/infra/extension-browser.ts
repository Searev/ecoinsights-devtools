import {
  AGENT_PORT_NAME,
  AgentError,
  AgentMethod,
  AgentParams,
  AgentRequestMessage,
  AgentResult,
  FromAgentMessage,
  RELOAD_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
} from "../../shared/protocol";
import { CollectOutcome } from "../domain/best-practices/rule";
import { Browser } from "../domain/models/browser";
import { Closeable } from "../domain/models/closeable";
import { NavigationEvent } from "../domain/models/navigation-event";
import { NetworkRequest } from "../domain/models/network-request";
import { PageDescription } from "../domain/models/page-description";
import { PageInfos } from "../domain/models/page-infos";
import { toNetworkRequest } from "./har";

/** Minimal subset of `chrome.runtime.Port` used by the adapter. */
export interface PortLike {
  postMessage(message: unknown): void;
  onMessage: { addListener(listener: (message: FromAgentMessage) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

/** Minimal subset of `chrome.devtools` (or `browser.devtools`) used by the adapter. */
export interface DevtoolsLike {
  inspectedWindow: { tabId: number };
  network: {
    // Chrome: callback form. Firefox `browser.*`: returns a Promise.
    getHAR(callback?: (har: { entries: HARFormatEntry[] }) => void): unknown;
    onRequestFinished: {
      addListener(listener: (entry: HARFormatEntry) => void): void;
      removeListener(listener: (entry: HARFormatEntry) => void): void;
    };
  };
}

export interface ExtensionBrowserDeps {
  runtime: { connect(info: { name: string }): PortLike };
  devtools: DevtoolsLike;
}

interface Pending {
  reject: (error: Error) => void;
  resolve: (value: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** `Browser` adapter for Chrome and Firefox: typed RPC to the background Page agent. */
export class ExtensionBrowser implements Browser {
  private port: PortLike | null = null;
  private pending = new Map<string, Pending>();
  private navigationListeners: Array<(event: NavigationEvent) => void> = [];

  constructor(private deps: ExtensionBrowserDeps) {}

  private get tabId(): number {
    return this.deps.devtools.inspectedWindow.tabId;
  }

  checkPermission(): Promise<boolean> {
    return this.call("permission.check", undefined);
  }

  getPageInfo(): Promise<PageInfos> {
    return this.call("page.info", undefined);
  }

  getPageDescription(): Promise<PageDescription> {
    return this.call("page.description", undefined);
  }

  collectPageData(ruleIds: string[]): Promise<Record<string, CollectOutcome>> {
    return this.call("page.collect", { ruleIds });
  }

  async getNetworkRequests(): Promise<NetworkRequest[]> {
    const har = await new Promise<{ entries: HARFormatEntry[] }>(
      (resolve, reject) => {
        try {
          const returned = this.deps.devtools.network.getHAR(resolve);
          if (isThenable(returned)) {
            returned.then(resolve as (v: unknown) => void, reject);
          }
        } catch (e) {
          reject(e);
        }
      }
    );
    return (har?.entries ?? [])
      .map(toNetworkRequest)
      .filter((r): r is NetworkRequest => r !== null);
  }

  onNetworkRequest(listener: (request: NetworkRequest) => void): Closeable {
    const handler = (entry: HARFormatEntry) => {
      const request = toNetworkRequest(entry);
      if (request) listener(request);
    };
    this.deps.devtools.network.onRequestFinished.addListener(handler);
    return {
      close: () =>
        this.deps.devtools.network.onRequestFinished.removeListener(handler),
    };
  }

  onNavigation(listener: (event: NavigationEvent) => void): Closeable {
    this.navigationListeners.push(listener);
    if (this.navigationListeners.length === 1) {
      this.setWatch(true);
    }
    let closed = false;
    return {
      close: () => {
        if (closed) return;
        closed = true;
        this.navigationListeners = this.navigationListeners.filter(
          (l) => l !== listener
        );
        if (this.navigationListeners.length === 0 && this.port) {
          this.setWatch(false);
        }
      },
    };
  }

  reloadInspectedPage(options: { purgeCache: boolean }): Promise<void> {
    return this.call("page.reload", options);
  }

  openUrlInNewTab(url: string): Promise<void> {
    return this.call("tab.open", { url });
  }

  log(message: string): void {
    this.call("page.log", { message }).catch(() => {});
  }

  private setWatch(enabled: boolean) {
    this.call("navigation.watch", { enabled }).catch(() => {});
  }

  private connect(): PortLike {
    if (this.port) return this.port;
    const port = this.deps.runtime.connect({ name: AGENT_PORT_NAME });
    this.port = port;
    port.onMessage.addListener((message) => this.handleMessage(message));
    port.onDisconnect.addListener(() => this.handleDisconnect(port));
    return port;
  }

  private handleMessage(message: FromAgentMessage) {
    if (message.type === "event") {
      [...this.navigationListeners].forEach((l) => l(message.event));
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return; // late or unknown response
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new AgentError(message.error.code, message.error.message));
    }
  }

  private handleDisconnect(port: PortLike) {
    if (this.port !== port) return;
    this.port = null;
    const pending = [...this.pending.values()];
    this.pending.clear();
    pending.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(new AgentError("DISCONNECTED", "Page agent port disconnected"));
    });
    if (this.navigationListeners.length > 0) {
      this.setWatch(true);
    }
  }

  private call<M extends AgentMethod>(
    method: M,
    params: AgentParams<M>
  ): Promise<AgentResult<M>> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timeoutMs =
        method === "page.reload" ? RELOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new AgentError("TIMEOUT", `${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const message: AgentRequestMessage<M> = {
        type: "request",
        id,
        tabId: this.tabId,
        method,
        params,
      };
      try {
        this.connect().postMessage(message);
      } catch (e) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(new AgentError("DISCONNECTED", String(e)));
      }
    });
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}
