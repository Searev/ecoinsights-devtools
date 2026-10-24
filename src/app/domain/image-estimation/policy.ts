/**
 * Product policy for image estimations (US-001, US-002): thresholds, caps and encoding settings.
 * Data only. See docs/architecture/ARCH-DECISION-008 for the reasons behind each value.
 */
import { EncodingSpec, ImageFormat } from "../models/image-estimation";

/** Gains under 10 kB are noise: the image is not an offender and its gain is not counted. */
export const NOISE_THRESHOLD_BYTES = 10_000;

/** Sobriety caps: larger images are skipped as "too-large" (US-001 §5). */
export const MAX_IMAGE_PIXELS = 25_000_000;
export const MAX_IMAGE_BYTES = 10_000_000;

/** Grade thresholds on `gain / evaluated image bytes`: A < 10% ≤ B ≤ 30% < C. */
export const GRADE_B_MIN_SHARE = 0.1;
export const GRADE_C_ABOVE_SHARE = 0.3;

/** Maximum offender lines per rule, then "… et N autres images". */
export const MAX_OFFENDER_LINES = 20;

/** US-005: memory cap of the comparison cache (originals + variants), LRU (ARCH-DECISION-014). */
export const COMPARISON_CACHE_MAX_BYTES = 50_000_000;

/** US-002: recommended format per source format. Formats absent here are not converted. */
export const RECOMMENDED_ENCODING: Partial<Record<ImageFormat, EncodingSpec>> = {
  jpeg: { format: "avif", quality: 65, speed: 6 },
  png: { format: "webp", lossless: true },
};

/** US-002: formats already compliant (listed nowhere, counted in the evaluated weight). */
export const ALREADY_OPTIMISED_FORMATS: readonly ImageFormat[] = ["webp", "avif"];

/**
 * US-001: re-encoding in the image's own format (PO settings).
 * AVIF uses quality 65 (owner decision D3, 2026-10-19), aligned with the US-002 conversion target.
 */
export const OWN_FORMAT_ENCODING: {
  jpeg: EncodingSpec;
  png: EncodingSpec;
  webpLossy: EncodingSpec;
  webpLossless: EncodingSpec;
  avif: EncodingSpec;
} = {
  jpeg: { format: "jpeg", quality: 80 },
  png: { format: "png", level: 2 },
  webpLossy: { format: "webp", lossless: false, quality: 80 },
  webpLossless: { format: "webp", lossless: true },
  avif: { format: "avif", quality: 65, speed: 6 },
};

/** Formats the WASM codecs can decode and re-encode. */
export const CODEC_FORMATS: readonly ImageFormat[] = ["jpeg", "png", "webp", "avif"];

/** Response MIME types (lower case, no parameters) mapped to a format. */
export const MIME_FORMATS: Readonly<Record<string, ImageFormat>> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/png": "png",
  "image/apng": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/x-ms-bmp": "bmp",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/tiff": "tiff",
};

/** MIME types too generic to identify a format: fall back to the file signature (US-002 rule 1). */
export const GENERIC_MIME_TYPES: readonly string[] = [
  "",
  "application/octet-stream",
  "binary/octet-stream",
  "application/binary",
];

/**
 * US-019: a GIF under this size (bytes, 1 ko = 1 000 bytes) is ignored by "Limiter l'utilisation des GIFs
 * animés", typically a tracking pixel. Exactly this size is counted; an unknown size (0) is ignored.
 */
export const MIN_COUNTED_GIF_BYTES = 5_000;
