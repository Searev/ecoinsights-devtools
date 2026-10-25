import { EstimationProgress, ImageFinding } from "./image-estimation";
import { TextFileType } from "./text-content";

/**
 * US-020: type of a previewed text file. `TextFileType` (the US-010 line types) plus `JSON`, which
 * the viewer supports for later rules although US-010 never flags it.
 */
export type TextPreviewType = TextFileType | "JSON";

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
  | { kind: "font" }
  /** US-020 (ARCH-DECISION-024): a text file whose content is shown, of the line's type. */
  | { kind: "text"; type: TextPreviewType };

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
  /**
   * US-029 (ARCH-DECISION-033): "offenders / expected" of this page, computed by the rule's
   * `evaluate()`. Present only with a `compliance`: never while pending or "Non évaluée", never for
   * `UseLazyLoading`, and absent in analyses saved before US-029 (never recomputed).
   */
  indicator?: BestPracticeIndicator;
}

/**
 * US-029: units of the indicators, persisted as stable keys. The French labels (singular / plural)
 * live in the view (`best-practices-view.ts`), so wording can change without a migration.
 */
export const RATIO_INDICATOR_UNITS = [
  "uncached-files",
  "autoplay-media",
  "uncompressed-files",
  "resized-images",
  "unminified-files",
  "unoptimised-images",
  "http1-requests",
  "missing-alternatives",
] as const;

export const COUNT_INDICATOR_UNITS = [
  "inline-blocks",
  "canvas-elements",
  "css-files",
  "domains",
  "gif-files",
  "requests",
  "custom-fonts",
] as const;

export const PRESENCE_INDICATOR_UNITS = ["print-css"] as const;

export type RatioIndicatorUnit = (typeof RATIO_INDICATOR_UNITS)[number];
export type CountIndicatorUnit = (typeof COUNT_INDICATOR_UNITS)[number];
export type PresenceIndicatorUnit = (typeof PRESENCE_INDICATOR_UNITS)[number];

/**
 * US-029 (ARCH-DECISION-033). Always counts what is wrong: a higher number is worse.
 * - `ratio`: `offenders` flagged elements among `expected` checked ones (`offenders <= expected`).
 * - `count`: `offenders` elements counted by the rule.
 * - `presence`: whether the expected element exists (`present: false` is the offending value).
 * Numbers are non-negative integers.
 */
export type BestPracticeIndicator =
  | { kind: "ratio"; offenders: number; expected: number; unit: RatioIndicatorUnit }
  | { kind: "count"; offenders: number; unit: CountIndicatorUnit }
  | { kind: "presence"; present: boolean; unit: PresenceIndicatorUnit };
