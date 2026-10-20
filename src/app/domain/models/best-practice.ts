import { EstimationProgress, ImageFinding } from "./image-estimation";

export type BestPracticeId = string;

/** A is compliant, C is not compliant. Compared as strings: the worst grade is the greatest. */
export type BestPracticeCompliance = "A" | "B" | "C";

/**
 * Links one line of `BestPractice.offenders` to the file it names, so the UI can render the US-004
 * display name (ARCH-DECISION-017). The line text must start with `prefix + fileLabel(url)`.
 */
export interface LineRef {
  /** Absolute URL of the file named by the line. */
  url: string;
  /** Text before the name, e.g. "Vidéo " or "Iframe ". Absent when the line starts with the name. */
  prefix?: string;
  /**
   * EPIC-PV (ARCH-DECISION-020): what the name of the line previews, set by the rule. Absent for
   * lines that cannot be previewed (`<area>` links, non-preview rules) and in analyses saved before
   * the epic, where `previewSubjectFor` falls back to the rule and prefix.
   */
  preview?: LinePreview;
}

/** CSS box of an element on the page, in CSS pixels, rounded. `0 × 0` means "not displayed". */
export interface PreviewBox {
  width: number;
  height: number;
}

/**
 * Persisted preview data of a line (ARCH-DECISION-020). `display` is the element's CSS box at the
 * latest collection: undefined when unknown (collector failed), `0 × 0` when not displayed.
 */
export type LinePreview =
  | { kind: "image"; display?: PreviewBox }
  | { kind: "video"; display?: PreviewBox }
  | { kind: "audio" }
  /** `top`: distance from the top of the page, in CSS pixels (US-007 data). */
  | { kind: "iframe"; top?: number }
  | { kind: "font" };

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
  /**
   * BP2 rules (ARCH-DECISION-017): one entry per `offenders` line, same order; `null` for a line
   * that names no file (domains, "… et N autres"). Absent in older analyses and for the image rules,
   * which pair their lines with `images` instead (ARCH-DECISION-015).
   */
  lineRefs?: (LineRef | null)[];
}
