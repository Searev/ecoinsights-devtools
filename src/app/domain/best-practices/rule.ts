import {
  BestPracticeCategory,
  BestPracticeCompliance,
  BestPracticeId,
  LineRef,
} from "../models/best-practice";
import {
  EstimateLookup,
  EstimationJob,
  EstimationProgress,
  ImageFinding,
} from "../models/image-estimation";
import { NetworkRequest } from "../models/network-request";
import { ContentJob, ContentLookup } from "../models/text-content";

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
  /**
   * Read-only view of the content-analysis cache (ARCH-DECISION-018, US-010). Always set by the
   * engine (default: every file `not-evaluated(analyser-unavailable)`); optional so that contexts
   * built by hand for rules that do not read contents stay valid. Rules treat undefined like
   * `UNAVAILABLE_CONTENTS`.
   */
  contents?: ContentLookup;
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
  /** One per `offenders` line, same order (ARCH-DECISION-017). Build with `capLines` (rule-lines.ts). */
  lineRefs?: (LineRef | null)[];
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
  /**
   * Optional, pure and synchronous (ARCH-DECISION-018): the text files whose captured content this
   * rule needs measured. Queued and cached by `contentKey` like estimations; read back through
   * `context.contents`. Called on every evaluation: it must be cheap.
   */
  contentAnalyses?(context: PlanningContext<TPage>): ContentJob[];
  /** Pure: no I/O, no state, no `chrome`, no `document`. Reads estimates through `context.estimates`, contents through `context.contents`. */
  evaluate(context: RuleContext<TPage>): RuleResult;
}
