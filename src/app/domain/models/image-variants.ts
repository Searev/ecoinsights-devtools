/**
 * Image comparison (US-005): shared contract between the domain, the codec adapter and the UI.
 * See docs/architecture/ARCH-DECISION-012 (on-demand variants), 013 (comparison subject) and 014 (cache).
 *
 * Bytes are plain `Uint8Array`s: the domain never touches `Blob` or object URLs (the UI creates and
 * revokes them).
 */
import { EstimationJob, ImageFormat } from "./image-estimation";

/** A version of an image that the comparison dialog can show. */
export type ImageVersionId =
  /** The file served by the site. */
  | "original"
  /** US-001: resized to the target size, same format ("Redimensionnée"). */
  | "resized"
  /** US-002: natural size, recommended format ("AVIF" or "WebP sans perte"). */
  | "converted"
  /** US-003: resized and converted, the variant of the combined page gain ("Les deux"). */
  | "both";

/** What the dialog shows about a file. */
export interface ImageFileInfo {
  /** Detected from the bytes (original) or the encoding applied (variant). */
  format: ImageFormat;
  /** WebP only: true for lossless (VP8L). Shown as "WebP sans perte". */
  lossless?: boolean;
  /** Pixel size of this file. */
  width: number;
  height: number;
  /** Byte length of this file. */
  byteLength: number;
  /** MIME type used to display the bytes (`image/jpeg`, `image/avif`…). */
  mimeType: string;
}

/**
 * Why a version could not be produced.
 * - `original-unavailable`: the original bytes could not be obtained or read (404, network, too
 *   large, not an image). Every version of the image fails with it.
 * - `generation-failed`: the original is fine but the variant could not be generated (decode,
 *   encode, timeout, worker error).
 */
export type ImageFileError = "original-unavailable" | "generation-failed";

export type ImageFileResult =
  | { status: "loaded"; bytes: Uint8Array; info: ImageFileInfo }
  | { status: "error"; error: ImageFileError; message?: string };

/**
 * Port: produces the original file and its optimised variants, with exactly the codecs and
 * settings of the estimation (`EstimationJob` transforms, `image-estimation/policy.ts`), so that a
 * generated size equals the estimated size for the same bytes (US-005 scenario 4).
 * Implemented by `WorkerImageEstimator` (same Web Worker as the estimation) and the dev
 * `FakeImageEstimator`. Methods never reject.
 */
export interface ImageVariantGenerator {
  /** Original bytes of `url`: DevTools content first, else a cache-first re-fetch (ARCH-DECISION-010). */
  loadOriginal(url: string, declaredType: string): Promise<ImageFileResult>;
  /**
   * Encodes `job.transform` from `original`. `original` is not modified nor detached (the adapter
   * transfers a copy). Failures are `generation-failed`.
   */
  generate(job: EstimationJob, original: Uint8Array): Promise<ImageFileResult>;
}

/**
 * Session cache of originals and variants (ARCH-DECISION-014), shared by every opening of the
 * dialog during the panel session. Created by `createImageVariantStore`
 * (`domain/image-comparison/variant-store.ts`). Methods never reject.
 */
export interface ImageVariantStore {
  /** Loaded original, from the cache or the generator. Concurrent calls share one load. */
  original(url: string, declaredType: string): Promise<ImageFileResult>;
  /**
   * Loaded variant, from the cache or generated from the (cached) original. Concurrent calls for
   * the same `estimationKey(job)` share one generation, which completes and fills the cache even if
   * every caller went away (US-005 scenario 14). An original failure gives `original-unavailable`.
   * Errors are never cached: calling again retries.
   */
  variant(job: EstimationJob): Promise<ImageFileResult>;
  /** Synchronous cache read (no load, refreshes the LRU position); undefined when not cached. */
  peekOriginal(url: string): ImageFileResult | undefined;
  peekVariant(job: EstimationJob): ImageFileResult | undefined;
}

/** One option of the dialog toggle. */
export interface ComparisonVersion {
  id: ImageVersionId;
  /** Toggle label, French: "Originale", "Redimensionnée", "AVIF", "WebP sans perte", "Les deux". */
  label: string;
  /** Job that produces the version; undefined for the original. */
  job?: EstimationJob;
  /** Size estimated during the analysis for this version, when known (US-005 scenario 4). */
  estimatedBytes?: number;
}

/**
 * Everything the comparison dialog needs about one offending image, derived from the persisted
 * findings of the page (`comparisonSubjectFor`, `domain/image-comparison/comparison-subject.ts`).
 */
export interface ComparisonSubject {
  /** Normalised image URL (finding URL). */
  url: string;
  /** MIME type from the network data ("" when unknown). */
  declaredType: string;
  /** Rule the dialog was opened from. */
  ruleId: string;
  /** Original weight recorded in the analysis (`ImageFinding.originalBytes`, ARCH-DECISION-011 §2). */
  recordedBytes: number;
  /** Body length obtained by the estimator during the analysis (`ImageFinding.sourceBytes`). */
  recordedSourceBytes?: number;
  natural?: { width: number; height: number };
  /** CSS display box on the page; undefined or 0×0 means "not displayed". */
  display?: { width: number; height: number };
  /** "original" first, then the variants in toggle order: resized, converted, both. */
  versions: ComparisonVersion[];
}
