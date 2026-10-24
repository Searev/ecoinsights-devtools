/**
 * EPIC-PV (US-015 to US-018, US-020): preview of the files named by best-practice lines.
 * Shared contract between the domain, the bytes adapter (`infra/file-preview/`) and the UI.
 * See docs/architecture/ARCH-DECISION-020 (subjects), 021 (dialog host), 022 (bytes), 023
 * (media, fonts, CSP), 024 (text subjects and bytes) and 025 (text viewer).
 *
 * Bytes are plain `Uint8Array`s: the domain never touches `Blob`, object URLs or `FontFace`.
 */
import { PreviewBox, TextPreviewType } from "./best-practice";

interface PreviewSubjectBase {
  /** Absolute URL of the file, as referenced by the line (`LineRef.url`). Always `http(s)`. */
  url: string;
  /** Rule the line belongs to. */
  ruleId: string;
}

/** US-015: an image of US-006 (`img`, `input type=image`), US-007 or US-013. */
export interface ImagePreviewSubject extends PreviewSubjectBase {
  kind: "image";
  /** Response MIME type of the last recorded request for the URL; "" when unknown. */
  declaredType: string;
  /** CSS box on the page; undefined (unknown) or `0 × 0` opens in "Taille réelle". */
  display?: PreviewBox;
}

/** US-016: a video of US-006 or US-014, or a sound of US-014. Streamed by the native player. */
export interface MediaPreviewSubject extends PreviewSubjectBase {
  kind: "media";
  media: "video" | "audio";
  /** Response MIME type of the last recorded request for the URL; undefined when unknown. */
  mimeType?: string;
  /**
   * Bytes the page downloaded for the URL during the analysis: sum over its requests (partial
   * `206` included) of the transfer size, or the body size when served from the cache. Undefined
   * when no request was recorded ("non téléchargé par la page").
   */
  downloadedBytes?: number;
  /**
   * HTTP status of the last recorded request for the URL; undefined when none. Tells a 404 from an
   * unsupported format when the player reports `MediaError` code 4 (ARCH-DECISION-023).
   */
  recordedStatus?: number;
  /** Video only: CSS box on the page; undefined (unknown) or `0 × 0` opens in "Taille réelle". */
  display?: PreviewBox;
}

/** US-017: an iframe of US-007. Data only, never embedded. */
export interface IframePreviewSubject extends PreviewSubjectBase {
  kind: "iframe";
  /** Host name of the URL ("www.google.com"). */
  host: string;
  /** Response MIME type of the document request; undefined when not recorded or empty. */
  mimeType?: string;
  /** Transfer size of the document request; undefined when not recorded ("non mesuré"). */
  transferredBytes?: number;
  /** Distance from the top of the page in CSS pixels; undefined in older analyses. */
  top?: number;
}

/** US-018: a font file of "Utiliser des polices standards". */
export interface FontPreviewSubject extends PreviewSubjectBase {
  kind: "font";
  /** Response MIME type of the last recorded request for the URL; "" when unknown. */
  declaredType: string;
}

/** US-020: a text file flagged "non minifié" by US-010 (ARCH-DECISION-024). */
export interface TextPreviewSubject extends PreviewSubjectBase {
  kind: "text";
  /** Type of the line ("Type" row, colouring language). */
  fileType: TextPreviewType;
  /** Response MIME type of the last recorded request for the URL; "" when unknown. */
  declaredType: string;
  /**
   * `charset` of the last recorded response `content-type`, lower case; undefined when absent.
   * Used to decode DevTools base64 content, and a re-download whose response has no charset.
   */
  charset?: string;
}

export type PreviewSubject =
  | ImagePreviewSubject
  | MediaPreviewSubject
  | IframePreviewSubject
  | FontPreviewSubject
  | TextPreviewSubject;

/** Image formats the preview recognises (US-015). */
export type PreviewImageFormat =
  | "jpeg"
  | "png"
  | "webp"
  | "avif"
  | "gif"
  | "svg"
  | "bmp"
  | "ico"
  | "unknown";

/** What the image preview shows about the file obtained. */
export interface PreviewImageInfo {
  /** From the signature, else the MIME type; "unknown" otherwise. */
  format: PreviewImageFormat;
  /** GIF with more than one frame ("GIF animé"). False for every other format. */
  animated: boolean;
  /** SVG: the resolution may be undefined ("non définie (image vectorielle)"). */
  vector: boolean;
  /**
   * Pixel size read from the file: the raster header, or the absolute `width`/`height` of the SVG
   * root. Undefined when it could not be read (the UI may then use the browser's decoded size,
   * except for a vector image).
   */
  width?: number;
  height?: number;
  /** Byte length of the file obtained. */
  byteLength: number;
  /** MIME type used to display the bytes from a `blob:` URL (`image/svg+xml` for SVG). */
  mimeType: string;
}

/** Font formats the preview recognises (US-018). */
export type FontFormat = "woff2" | "woff" | "ttf" | "otf" | "eot" | "unknown";

export interface PreviewFontInfo {
  /** From the signature, else the MIME type, else the URL extension; "unknown" otherwise. */
  format: FontFormat;
  /** Byte length of the file obtained. */
  byteLength: number;
  /** Response MIME type, else the declared type; "" when unknown. */
  mimeType: string;
}

/** What the text preview needs to decode and describe the bytes obtained (US-020). */
export interface PreviewTextInfo {
  /** Byte length of the content obtained ("Poids"). UTF-8 length when DevTools gave decoded text. */
  byteLength: number;
  /** Response MIME type without parameters, else the declared type; "" when unknown. */
  mimeType: string;
  /**
   * Encoding label to decode `bytes` with, lower case: "utf-8" when DevTools gave decoded text,
   * else the response `charset`, else the subject's, else "utf-8".
   */
  charset: string;
}

/**
 * Why a preview file could not be obtained.
 * - `unavailable`: no DevTools content and the re-download failed (404, network), or the bytes are
 *   not of the expected kind (not an image, not a font).
 * - `too-large`: the file is over `MAX_PREVIEW_BYTES` (25 MB); nothing is decoded.
 */
export type PreviewFileError = "unavailable" | "too-large";

export type PreviewFileResult<I> =
  | { status: "loaded"; bytes: Uint8Array; info: I }
  | { status: "error"; error: PreviewFileError; message?: string };

/**
 * Port: obtains the bytes of a previewed file (ARCH-DECISION-022): DevTools content first, else a
 * cache-first re-download from the panel, capped at `MAX_PREVIEW_BYTES`. Implemented by
 * `createPreviewFileLoader` (`infra/file-preview/`) and a dev fake. Methods never reject.
 */
export interface PreviewFileLoader {
  loadImage(url: string, declaredType: string): Promise<PreviewFileResult<PreviewImageInfo>>;
  loadFont(url: string, declaredType: string): Promise<PreviewFileResult<PreviewFontInfo>>;
  /** US-020: any bytes are accepted; `charset` is the subject's (ARCH-DECISION-024). */
  loadText(url: string, declaredType: string, charset?: string): Promise<PreviewFileResult<PreviewTextInfo>>;
}

/**
 * Session cache of previewed files (epic §5), sharing the comparison LRU (ARCH-DECISION-014).
 * Created by `createPreviewFileStore` (`domain/file-preview/preview-store.ts`). Concurrent calls
 * share one load, which completes and fills the cache even when the dialog closed; errors are never
 * cached. Methods never reject.
 */
export interface PreviewFileStore {
  image(url: string, declaredType: string): Promise<PreviewFileResult<PreviewImageInfo>>;
  font(url: string, declaredType: string): Promise<PreviewFileResult<PreviewFontInfo>>;
  /** US-020: the raw bytes are cached (sized by the LRU); the UI decodes them. */
  text(url: string, declaredType: string, charset?: string): Promise<PreviewFileResult<PreviewTextInfo>>;
  /** Synchronous cache reads (loaded files only; refreshes the LRU position). */
  peekImage(url: string): PreviewFileResult<PreviewImageInfo> | undefined;
  peekFont(url: string): PreviewFileResult<PreviewFontInfo> | undefined;
  peekText(url: string): PreviewFileResult<PreviewTextInfo> | undefined;
}
