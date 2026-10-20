/**
 * Image weight estimation: shared contract (US-001, US-002, US-003).
 * See docs/architecture/ARCH-DECISION-007 to 011.
 *
 * Everything here is plain, JSON-serialisable data: estimation jobs cross the Web Worker boundary,
 * and findings are persisted with the analysis in localStorage.
 */

/** Image format, detected from the response MIME type, else from the file signature. */
export type ImageFormat =
  | "jpeg"
  | "png"
  | "webp"
  | "avif"
  | "gif"
  | "svg"
  | "bmp"
  | "ico"
  | "tiff"
  | "unknown";

/** How an image is re-encoded by an estimation. Settings come from `image-estimation/policy.ts`. */
export type EncodingSpec =
  /** mozjpeg. */
  | { format: "jpeg"; quality: number }
  /** oxipng optimisation level, from raw pixels. */
  | { format: "png"; level: number }
  | { format: "webp"; lossless: true }
  | { format: "webp"; lossless: false; quality: number }
  /** libavif, 4:2:0, 8 bits. `speed` 0 (slowest) to 10 (fastest). */
  | { format: "avif"; quality: number; speed: number };

/**
 * Transformation estimated for one image.
 * - `resize` (US-001): resize to `width`×`height` (Lanczos3), re-encode in the image's own format.
 * - `convert` (US-002): keep the natural size, encode in the recommended format of the source format.
 * - `resize-convert` (US-003): both, in a single encode.
 */
export type ImageTransform =
  | { kind: "resize"; width: number; height: number }
  | { kind: "convert" }
  | { kind: "resize-convert"; width: number; height: number };

export interface EstimationJob {
  /** Absolute URL of the image, without fragment (see `normaliseImageUrl`). */
  url: string;
  /** Response MIME type from the network data, without parameters; "" when unknown. */
  declaredType: string;
  transform: ImageTransform;
}

/** The image is out of scope or was not estimated on purpose. Not listed, not counted, except `too-large` and `analysis-stopped`. */
export type SkipReason =
  /** Over `MAX_IMAGE_PIXELS` or `MAX_IMAGE_BYTES`. Shown as "non évaluée (image trop volumineuse)". */
  | "too-large"
  /** No codec for this format (GIF, BMP, ICO, TIFF, SVG, unknown). Not listed, not counted. */
  | "unsupported-format"
  /** Animated GIF, APNG or animated WebP. Not listed, not counted. */
  | "animated"
  /** `convert` on a format that is already optimised (WebP, AVIF). Not listed. */
  | "already-optimised"
  /** Generic MIME type whose bytes are not an image. Not listed, not counted. */
  | "not-an-image"
  /** Still pending when the analysis was stopped. Shown as "non évaluée (analyse arrêtée)". */
  | "analysis-stopped";

export type FailReason =
  /** Neither DevTools nor a re-fetch could provide the original bytes. */
  | "bytes-unavailable"
  | "decode-failed"
  | "encode-failed"
  /** The worker did not answer in time; it was recycled. */
  | "timeout"
  /** No estimator was injected (tests, or an environment without workers). */
  | "estimator-unavailable";

export type EstimationOutcome =
  | {
      status: "estimated";
      sourceFormat: ImageFormat;
      /** Encoding actually applied. */
      target: EncodingSpec;
      /** Byte length of the original file as obtained (decoded body, no headers). */
      sourceBytes: number;
      /** Byte length of the re-encoded file. */
      encodedBytes: number;
      /** Natural size of the source image. */
      width: number;
      height: number;
    }
  | { status: "skipped"; reason: SkipReason; sourceFormat?: ImageFormat }
  | { status: "failed"; reason: FailReason; message?: string };

export type EstimateState = { status: "pending" } | EstimationOutcome;

/**
 * Read-only view of the estimation cache, injected into `RuleContext.estimates`.
 * Returns undefined for a job that was never requested.
 */
export type EstimateLookup = (job: EstimationJob) => EstimateState | undefined;

/** Cache key of a job: URL + transformation. The declared type is not part of the key. */
export function estimationKey(job: EstimationJob): string {
  const t = job.transform;
  const size = t.kind === "convert" ? "" : `:${t.width}x${t.height}`;
  return `${job.url}|${t.kind}${size}`;
}

/** Lookup used when no estimator is available: every job is `failed(estimator-unavailable)`. */
export const UNAVAILABLE_ESTIMATES: EstimateLookup = () => ({
  status: "failed",
  reason: "estimator-unavailable",
});

/**
 * One image examined by an image rule, persisted in `BestPractice.images`.
 * Only images that needed an estimation are listed (in-scope candidates).
 */
export interface ImageFinding {
  url: string;
  /** Weight used as the original size: see `originalBytesOf`. 0 while unknown. */
  originalBytes: number;
  state: EstimateState["status"];
  reason?: SkipReason | FailReason;
  /** Size after the rule's transformation (state `estimated` only). */
  estimatedBytes?: number;
  /** `originalBytes − estimatedBytes`, clamped at 0 (state `estimated` only). */
  gainBytes?: number;
  /** True when `gainBytes ≥ NOISE_THRESHOLD_BYTES`. */
  offender: boolean;
  /** MIME type from the network data ("" when unknown). */
  declaredType: string;
  sourceFormat?: ImageFormat;
  /** US-001: required size on the current screen (resize target). */
  target?: { width: number; height: number };
  /** US-002: encoding of the recommended format. */
  encoding?: EncodingSpec;
  /**
   * US-005 (ARCH-DECISION-013): natural size of the image in pixels, when known (from the page's
   * `<img>` or from the estimation outcome). Absent in findings saved before US-005.
   */
  natural?: { width: number; height: number };
  /**
   * US-005: largest CSS box (CSS pixels) in which the image is displayed on the page.
   * `{ width: 0, height: 0 }` when the image is not displayed by any `<img>` of the page.
   * Absent when unknown (findings saved before US-005, or the page could not be inspected):
   * the comparison dialog treats it like "not displayed".
   */
  display?: { width: number; height: number };
  /**
   * US-005: byte length of the original file as obtained by the estimator (state `estimated`,
   * `EstimationOutcome.sourceBytes`). Used to detect that the image changed since the analysis.
   */
  sourceBytes?: number;
}

/** Estimation progress of a rule on a page. Present only while at least one image is pending. */
export interface EstimationProgress {
  /** Images whose estimation is over (estimated, skipped or failed). */
  done: number;
  /** Images that need an estimation. */
  total: number;
  /**
   * What is counted: images (estimations, default) or text files (US-010 content analysis,
   * "Analyse en cours… (n/N fichiers)").
   */
  unit?: "images" | "files";
}

/** US-003: combined image gain of one page, persisted in `PageAnalysis.imageGain`. */
export interface PageImageGain {
  /** Sum of the combined gains of the images transferred by the page (each ≥ the noise threshold). */
  bytes: number;
  /** Images whose gain is still being estimated; they contribute 0 to `bytes`. */
  pendingCount: number;
  /** Images that could not be evaluated (too large, bytes unavailable, codec failure, analysis stopped). */
  notEvaluatedCount: number;
  /** Images flagged by both rules whose combined encode failed: their gain is max(resize, format). */
  fallbackCount: number;
}

/** Ids of the two image rules, used by the US-003 aggregation. */
export const RESIZE_IMAGES_RULE_ID = "DontResizeImagesInBrowser";
export const OPTIMISED_FORMATS_RULE_ID = "UseOptimizedImageFormats";

/** US-003 page gain status, derived (ARCH-DECISION-011 §8). */
export function imageGainStatus(gain: PageImageGain): "pending" | "partial" | "complete" {
  if (gain.pendingCount > 0) return "pending";
  if (gain.notEvaluatedCount + gain.fallbackCount > 0) return "partial";
  return "complete";
}
