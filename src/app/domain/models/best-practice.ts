import { EstimationProgress, ImageFinding } from "./image-estimation";

export type BestPracticeId = string;

/** A is compliant, C is not compliant. Compared as strings: the worst grade is the greatest. */
export type BestPracticeCompliance = "A" | "B" | "C";

export type BestPracticeCategory =
  | "content"
  | "images"
  | "fonts"
  | "network"
  | "css"
  | "js";

/** Result of one best-practice rule on one Page analysis. Persisted with the Analysis. */
export interface BestPractice {
  id: BestPracticeId;
  name: string;
  category: BestPracticeCategory;
  /** Undefined when the rule could not be evaluated (see `error`). */
  compliance?: BestPracticeCompliance;
  detail: string;
  /** URLs or descriptions of the elements breaking the rule. */
  offenders?: string[];
  /** Set when collection or evaluation failed. */
  error?: string;
  /**
   * Present while image estimations are pending ("Estimation en cours… (done/total images)").
   * `compliance` is then undefined. Never present in a saved analysis (stop settles every job).
   */
  progress?: EstimationProgress;
  /** Image rules only (US-001, US-002): per-image findings, used by the US-003 page gain. */
  images?: ImageFinding[];
}
