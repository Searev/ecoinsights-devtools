import { CollectOutcome } from "../domain/best-practices/rule";
import { Browser } from "../domain/models/browser";
import { Closeable } from "../domain/models/closeable";
import { NavigationEvent } from "../domain/models/navigation-event";
import { NetworkRequest } from "../domain/models/network-request";
import { PageDescription } from "../domain/models/page-description";
import { PageInfos } from "../domain/models/page-infos";

export interface MockBrowserInitial {
  pageInfo: PageInfos;
  description: PageDescription;
  requests: NetworkRequest[];
  permission: boolean;
  pageData: Record<string, CollectOutcome>;
}

/**
 * In-memory `Browser` for `npm run dev` and tests. Has no timers: everything is driven
 * by the test helpers (`emit*`, `set*`). Every `Browser` call is recorded in `calls`.
 */
export class MockBrowser implements Browser {
  calls: Array<{ method: string; args: unknown[] }> = [];

  private pageInfo: PageInfos;
  private description: PageDescription;
  private requests: NetworkRequest[];
  private permission: boolean;
  private pageData: Record<string, CollectOutcome>;
  private requestListeners: Array<(r: NetworkRequest) => void> = [];
  private navigationListeners: Array<(e: NavigationEvent) => void> = [];

  constructor(initial: Partial<MockBrowserInitial> = {}) {
    this.pageInfo = initial.pageInfo ?? {
      title: "Mocked page",
      url: "https://www.example.org",
      domSize: 100,
    };
    this.description = initial.description ?? {
      name: "Mocked page",
      description: "A mocked service in order to test the app",
      url: "https://www.example.org",
    };
    this.requests = [...(initial.requests ?? [])];
    this.permission = initial.permission ?? true;
    this.pageData = initial.pageData ?? {};
  }

  // --- Test helpers ---

  setPageInfo(pageInfo: PageInfos): void {
    this.pageInfo = pageInfo;
  }

  setPageData(pageData: Record<string, CollectOutcome>): void {
    this.pageData = pageData;
  }

  emitNetworkRequest(request: NetworkRequest): void {
    this.requests.push(request);
    [...this.requestListeners].forEach((l) => l(request));
  }

  emitNavigation(event: NavigationEvent): void {
    [...this.navigationListeners].forEach((l) => l(event));
  }

  // --- Browser ---

  async checkPermission(): Promise<boolean> {
    this.record("checkPermission");
    return this.permission;
  }

  async getPageInfo(): Promise<PageInfos> {
    this.record("getPageInfo");
    return { ...this.pageInfo };
  }

  async getPageDescription(): Promise<PageDescription> {
    this.record("getPageDescription");
    return { ...this.description };
  }

  async collectPageData(
    ruleIds: string[]
  ): Promise<Record<string, CollectOutcome>> {
    this.record("collectPageData", ruleIds);
    const result: Record<string, CollectOutcome> = {};
    for (const id of ruleIds) {
      if (id in this.pageData) result[id] = this.pageData[id];
    }
    return result;
  }

  async getNetworkRequests(): Promise<NetworkRequest[]> {
    this.record("getNetworkRequests");
    return [...this.requests];
  }

  onNetworkRequest(listener: (request: NetworkRequest) => void): Closeable {
    this.record("onNetworkRequest");
    this.requestListeners.push(listener);
    return {
      close: () => {
        this.requestListeners = this.requestListeners.filter(
          (l) => l !== listener
        );
      },
    };
  }

  onNavigation(listener: (event: NavigationEvent) => void): Closeable {
    this.record("onNavigation");
    this.navigationListeners.push(listener);
    return {
      close: () => {
        this.navigationListeners = this.navigationListeners.filter(
          (l) => l !== listener
        );
      },
    };
  }

  async reloadInspectedPage(options: { purgeCache: boolean }): Promise<void> {
    this.record("reloadInspectedPage", options);
  }

  async openUrlInNewTab(url: string): Promise<void> {
    this.record("openUrlInNewTab", url);
  }

  log(message: string): void {
    this.record("log", message);
    console.log("EcoInsights : " + message);
  }

  private record(method: string, ...args: unknown[]) {
    this.calls.push({ method, args });
  }
}
