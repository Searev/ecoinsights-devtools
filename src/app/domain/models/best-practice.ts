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
}
