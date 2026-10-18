import {
  BestPracticeCategory,
  BestPracticeCompliance,
  BestPracticeId,
} from "../models/best-practice";
import { NetworkRequest } from "../models/network-request";

/**
 * Outcome of running one rule collector in the inspected page.
 * Must stay JSON-serialisable: it crosses the extension message port.
 */
export type CollectOutcome =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export interface RuleContext<TPage> {
  /** URL of the analysed page. */
  url: string;
  /** Normalised requests of the analysed page. */
  requests: readonly NetworkRequest[];
  /** Data returned by `collect`; undefined if the rule has no collector or collection failed. */
  page: TPage | undefined;
}

export interface RuleResult {
  compliance: BestPracticeCompliance;
  detail: string;
  offenders?: string[];
}

/**
 * A sustainable-design best practice. One rule = one file in `./rules/`, registered in `./index.ts`.
 * See docs/architecture/ARCH-DECISION-004.
 */
export interface BestPracticeRule<TPage = undefined> {
  id: BestPracticeId;
  /** Label shown in the UI (French). */
  name: string;
  category: BestPracticeCategory;
  /**
   * Runs in the inspected page through `chrome.scripting.executeScript({ func })`, so it is
   * serialised with `Function.prototype.toString`: it MUST NOT reference imports, module
   * variables or closures, and MUST return JSON-serialisable data.
   */
  collect?: () => TPage;
  /** Pure: no I/O, no state, no `chrome`, no `document`. */
  evaluate(context: RuleContext<TPage>): RuleResult;
}
