/**
 * Minimal typed subset of the `chrome` API used by the Page agent.
 * Lets tests inject a hand-written fake (ARCH-DECISION-006) instead of mocking modules.
 */

export interface EventLike<F extends (...args: any[]) => void> {
  addListener(callback: F): void;
  removeListener(callback: F): void;
}

export interface PortLike {
  name: string;
  onMessage: EventLike<(message: unknown) => void>;
  onDisconnect: EventLike<() => void>;
  postMessage(message: unknown): void;
}

export interface SenderLike {
  tab?: { id?: number };
  frameId?: number;
}

export interface TabLike {
  id?: number;
  url?: string;
}

export interface TabChangeInfo {
  url?: string;
  status?: string;
}

export interface InjectionLike {
  target: { tabId: number };
  func?: (...args: any[]) => unknown;
  args?: unknown[];
  files?: string[];
}

export interface ChromeLike {
  runtime: {
    onConnect: EventLike<(port: PortLike) => void>;
    onMessage: EventLike<(message: unknown, sender: SenderLike) => void>;
  };
  scripting: {
    executeScript(
      injection: InjectionLike
    ): Promise<Array<{ result?: unknown }>>;
  };
  tabs: {
    get(tabId: number): Promise<TabLike>;
    reload(tabId: number, options?: { bypassCache?: boolean }): Promise<unknown>;
    create(options: { url: string }): Promise<unknown>;
    onUpdated: EventLike<
      (tabId: number, changeInfo: TabChangeInfo, tab: TabLike) => void
    >;
  };
  permissions: {
    contains(permissions: { origins: string[] }): Promise<boolean>;
  };
  browsingData: {
    remove(
      options: { since?: number },
      dataToRemove: { cache?: boolean; serviceWorkers?: boolean }
    ): Promise<unknown>;
  };
}
