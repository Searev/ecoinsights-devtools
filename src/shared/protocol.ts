/**
 * Typed RPC between the DevTools panel (ExtensionBrowser) and the background Page agent,
 * plus the one-way messages sent by the Probe content script.
 * Identical on Chrome and Firefox. See docs/architecture/ARCH-DECISION-002.
 *
 * Everything in this file must stay JSON-serialisable and free of runtime `chrome` usage,
 * because it is bundled in the DevTools app, the background script and the Probe.
 */
import type { CollectOutcome } from "../app/domain/best-practices/rule";
import type { NavigationEvent } from "../app/domain/models/navigation-event";
import type { PageDescription } from "../app/domain/models/page-description";
import type { PageInfos } from "../app/domain/models/page-infos";

/** `chrome.runtime.connect({ name })` used by the DevTools panel. */
export const AGENT_PORT_NAME = "ecoinsights-page-agent";

/** Client-side timeout applied to every request except `page.reload`. */
export const REQUEST_TIMEOUT_MS = 5_000;
/** Client-side timeout for `page.reload` (waits for the tab to be `complete`). */
export const RELOAD_TIMEOUT_MS = 30_000;

/** Every DevTools → Page agent call. Adding a capability starts with one entry here. */
export interface AgentRequests {
  "permission.check": { params: void; result: boolean };
  "page.info": { params: void; result: PageInfos };
  "page.description": { params: void; result: PageDescription };
  /** Runs the collectors of the given rule ids; unknown ids / rules without collector are omitted. */
  "page.collect": {
    params: { ruleIds: string[] };
    result: Record<string, CollectOutcome>;
  };
  /** Resolves once `tabs.onUpdated` reports `status === "complete"` for the tab. */
  "page.reload": { params: { purgeCache: boolean }; result: void };
  "page.log": { params: { message: string }; result: void };
  "tab.open": { params: { url: string }; result: void };
  /**
   * enabled=true: inject the Probe now and after every completed load, forward
   * `url-changed` from tabs.onUpdated and Probe events as `event` messages.
   * enabled=false: stop forwarding and stop re-injecting. Idempotent.
   */
  "navigation.watch": { params: { enabled: boolean }; result: void };
}

export type AgentMethod = keyof AgentRequests;
export type AgentParams<M extends AgentMethod> = AgentRequests[M]["params"];
export type AgentResult<M extends AgentMethod> = AgentRequests[M]["result"];

export type AgentErrorCode =
  | "TIMEOUT" // raised client-side by ExtensionBrowser
  | "DISCONNECTED" // port closed while a request was pending (client-side)
  | "NO_PERMISSION" // host permission missing for the tab
  | "UNKNOWN_METHOD"
  | "INTERNAL";

export interface AgentErrorPayload {
  code: AgentErrorCode;
  message: string;
}

/** Error type used to reject `Browser` promises. */
export class AgentError extends Error {
  constructor(public readonly code: AgentErrorCode, message: string) {
    super(message);
    this.name = "AgentError";
  }
}

/** DevTools → Page agent. `tabId` is the inspected tab (`chrome.devtools.inspectedWindow.tabId`). */
export interface AgentRequestMessage<M extends AgentMethod = AgentMethod> {
  type: "request";
  id: string;
  tabId: number;
  method: M;
  params: AgentParams<M>;
}

/** Page agent → DevTools. */
export type AgentResponseMessage =
  | { type: "response"; id: string; ok: true; result: unknown }
  | { type: "response"; id: string; ok: false; error: AgentErrorPayload };

/** Page agent → DevTools, pushed while `navigation.watch` is enabled for that port. */
export interface AgentEventMessage {
  type: "event";
  event: NavigationEvent;
}

export type FromAgentMessage = AgentResponseMessage | AgentEventMessage;

/** Probe (content script) → Page agent through `chrome.runtime.sendMessage`. */
export interface ProbeMessage {
  source: "ecoinsights-probe";
  event: Extract<NavigationEvent, { kind: "link-clicked" | "form-submitted" }>;
}

export function isProbeMessage(value: unknown): value is ProbeMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ProbeMessage).source === "ecoinsights-probe" &&
    typeof (value as ProbeMessage).event?.url === "string"
  );
}
