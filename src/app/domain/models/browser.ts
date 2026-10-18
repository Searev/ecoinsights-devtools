import { CollectOutcome } from "../best-practices/rule";
import { Closeable } from "./closeable";
import { NavigationEvent } from "./navigation-event";
import { NetworkRequest } from "./network-request";
import { PageDescription } from "./page-description";
import { PageInfos } from "./page-infos";

/**
 * The seam between the domain and the browser running the extension.
 *
 * Adapters: `ExtensionBrowser` (Chrome + Firefox) and `MockBrowser` (dev server + tests).
 * See docs/architecture/ARCH-DECISION-001 and 003.
 *
 * Contract rules:
 * - Every method targets the inspected tab; callers never handle tab ids.
 * - Promises reject with an `AgentError` (src/shared/protocol.ts) on failure or timeout; they never hang.
 * - No timers live behind this interface: polling and scheduling belong to the domain.
 * - This file imports domain models only.
 */
export interface Browser {
  /** Whether the extension may read the inspected page (host permission granted). */
  checkPermission(): Promise<boolean>;

  /** Title, URL and DOM size of the inspected page. Also used by the domain for DOM-size polling. */
  getPageInfo(): Promise<PageInfos>;

  /** Title, meta description and origin, used to prefill a new Service. */
  getPageDescription(): Promise<PageDescription>;

  /**
   * Runs the page collector of each given best-practice rule in the inspected page.
   * Unknown ids and rules without a collector are omitted from the result.
   * A collector that throws yields `{ ok: false }` for that id only.
   */
  collectPageData(ruleIds: string[]): Promise<Record<string, CollectOutcome>>;

  /** Every request recorded so far by DevTools for the inspected page (HAR), normalised. */
  getNetworkRequests(): Promise<NetworkRequest[]>;

  /** Notified for each finished request (DevTools `onRequestFinished`), normalised. */
  onNetworkRequest(listener: (request: NetworkRequest) => void): Closeable;

  /**
   * Notified of navigation events in the inspected tab. The Probe is injected while at least one
   * listener is registered, and removed (best effort) when the last one is closed.
   */
  onNavigation(listener: (event: NavigationEvent) => void): Closeable;

  /** Optionally purges the HTTP cache, reloads bypassing cache, resolves once the tab status is `complete`. */
  reloadInspectedPage(options: { purgeCache: boolean }): Promise<void>;

  openUrlInNewTab(url: string): Promise<void>;

  /** Writes `EcoInsights : <message>` in the inspected page console. Fire and forget. */
  log(message: string): void;
}
