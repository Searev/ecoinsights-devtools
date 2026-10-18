import type {
  ChromeLike,
  EventLike,
  InjectionLike,
  PortLike,
  SenderLike,
  TabChangeInfo,
  TabLike,
} from "../chrome-like";

/** Hand-written event emitter standing in for `chrome.*.onXxx`. */
export class FakeEvent<F extends (...args: any[]) => void> implements EventLike<F> {
  readonly listeners = new Set<F>();
  addListener(cb: F) {
    this.listeners.add(cb);
  }
  removeListener(cb: F) {
    this.listeners.delete(cb);
  }
  emit(...args: Parameters<F>) {
    [...this.listeners].forEach((l) => l(...args));
  }
}

export class FakePort implements PortLike {
  readonly onMessage = new FakeEvent<(m: unknown) => void>();
  readonly onDisconnect = new FakeEvent<() => void>();
  readonly sent: any[] = [];
  private waiters: Array<() => void> = [];

  constructor(public name: string) {}

  postMessage(message: unknown) {
    this.sent.push(message);
    this.waiters.forEach((w) => w());
  }

  /** Simulates the DevTools panel sending a message. */
  send(message: unknown) {
    this.onMessage.emit(message);
  }

  disconnect() {
    this.onDisconnect.emit();
  }

  /** Sends a request and resolves with the matching response message. */
  request(id: string, tabId: number, method: string, params?: unknown) {
    const done = new Promise<any>((resolve) => {
      const check = () => {
        const found = this.sent.find((m) => m.type === "response" && m.id === id);
        if (found) {
          this.waiters = this.waiters.filter((w) => w !== check);
          resolve(found);
        }
      };
      this.waiters.push(check);
    });
    this.send({ type: "request", id, tabId, method, params });
    return done;
  }

  get events() {
    return this.sent.filter((m) => m.type === "event");
  }
}

export type ExecuteHandler = (injection: InjectionLike) => unknown | Promise<unknown>;

export function createFakeChrome() {
  const onConnect = new FakeEvent<(port: PortLike) => void>();
  const onMessage = new FakeEvent<(m: unknown, s: SenderLike) => void>();
  const onUpdated = new FakeEvent<
    (tabId: number, c: TabChangeInfo, t: TabLike) => void
  >();

  const executed: InjectionLike[] = [];
  const state = {
    executeHandler: ((inj: InjectionLike) =>
      inj.func ? inj.func(...(inj.args ?? [])) : undefined) as ExecuteHandler,
    tabs: new Map<number, TabLike>(),
    permissionsContains: [] as Array<{ origins: string[] }>,
    permissionsResult: true,
    browsingDataCalls: [] as Array<{ options: any; types: any }>,
    reloads: [] as Array<{ tabId: number; options: any }>,
    created: [] as Array<{ url: string }>,
  };

  const chrome: ChromeLike = {
    runtime: { onConnect, onMessage },
    scripting: {
      async executeScript(injection) {
        executed.push(injection);
        const result = await state.executeHandler(injection);
        return [{ result }];
      },
    },
    tabs: {
      async get(tabId) {
        return state.tabs.get(tabId) ?? { id: tabId };
      },
      async reload(tabId, options) {
        state.reloads.push({ tabId, options });
      },
      async create(options) {
        state.created.push(options);
      },
      onUpdated,
    },
    permissions: {
      async contains(p) {
        state.permissionsContains.push(p);
        return state.permissionsResult;
      },
    },
    browsingData: {
      async remove(options, types) {
        state.browsingDataCalls.push({ options, types });
      },
    },
  };

  function connect(name: string) {
    const port = new FakePort(name);
    onConnect.emit(port);
    return port;
  }

  return { chrome, connect, onConnect, onMessage, onUpdated, executed, state };
}
