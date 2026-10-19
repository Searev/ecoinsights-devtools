import {
  BestPracticeCategory,
  BestPracticeCompliance,
  BestPracticeId,
} from "../models/best-practice";
import {
  EstimateLookup,
  EstimationJob,
  EstimationProgress,
  ImageFinding,
} from "../models/image-estimation";
import { NetworkRequest } from "../models/network-request";

/**
 * Outcome of running one rule collector in the inspected page.
 * Must stay JSON-serialisable: it crosses the extension message port.
 */
export type CollectOutcome =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/** Input of `estimations`: everything a rule knows about the page except estimation results. */
export interface PlanningContext<TPage> {
  /** URL of the analysed page. */
  url: string;
  /** Normalised requests of the analysed page. */
  requests: readonly NetworkRequest[];
  /** Data returned by `collect`; undefined if the rule has no collector or collection failed. */
  page: TPage | undefined;
}

export interface RuleContext<TPage> extends PlanningContext<TPage> {
  /**
   * Read-only view of the estimation cache (ARCH-DECISION-007). Returns undefined for a job that
   * was never requested; rules treat undefined like `pending`. The engine defaults it to a lookup
   * answering `failed(estimator-unavailable)` when no estimator is wired.
   */
  estimates: EstimateLookup;
}

export interface RuleResult {
  /** Undefined while estimations are pending, or when nothing could be evaluated ("Non évaluée"). */
  compliance?: BestPracticeCompliance;
  detail: string;
  offenders?: string[];
  /** Present only while at least one estimation of this rule is pending on the page. */
  progress?: EstimationProgress;
  /** Image rules only: one entry per image that needed an estimation. */
  images?: ImageFinding[];
}

/**
 * A sustainable-design best practice. One rule = one file in `./rules/`, registered in `./index.ts`.
 * See docs/architecture/ARCH-DECISION-004 (amended by ARCH-DECISION-007).
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
  /**
   * Optional, pure and synchronous: the estimation jobs this rule needs for the page.
   * The use case enqueues them (deduplicated and cached by `estimationKey`) and re-evaluates the
   * page whenever an estimate settles. Called on every evaluation: it must be cheap.
   */
  estimations?(context: PlanningContext<TPage>): EstimationJob[];
  /** Pure: no I/O, no state, no `chrome`, no `document`. Reads estimates through `context.estimates`. */
  evaluate(context: RuleContext<TPage>): RuleResult;
}
