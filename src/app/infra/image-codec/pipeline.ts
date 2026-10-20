/**
 * Estimation pipeline (ARCH-DECISION-008, 009): original bytes in, estimated re-encoded size out.
 * Runs inside the codec Web Worker. All encoding settings come from `image-estimation/policy.ts`.
 * The returned function never rejects: every problem is an `EstimationOutcome`.
 */
import { detectImageFormat } from "../../domain/image-estimation/signature";
import { formatFromMime } from "../../domain/image-estimation/image-requests";
import {
  ALREADY_OPTIMISED_FORMATS,
  CODEC_FORMATS,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  OWN_FORMAT_ENCODING,
  RECOMMENDED_ENCODING,
} from "../../domain/image-estimation/policy";
import {
  EncodingSpec,
  EstimationJob,
  EstimationOutcome,
  FailReason,
  ImageFormat,
  SkipReason,
} from "../../domain/models/image-estimation";
import { decodeBase64 } from "./base64";
import { Codecs, RawImage } from "./codecs";
import { isAnimated, isLosslessWebp, readDimensions } from "./image-inspect";
import { ImageBytes } from "./worker-protocol";
import { ImageFileInfo } from "../../domain/models/image-variants";

type DecodableFormat = "jpeg" | "png" | "webp" | "avif";

export interface PipelineRequest {
  job: EstimationJob;
  source: ImageBytes;
}

export interface InspectPipelineRequest {
  declaredType: string;
  source: ImageBytes;
}

/** Result of `inspect` and `generate`: a file with its info, or why there is none. */
export type FileResult =
  | { ok: true; bytes: Uint8Array; info: ImageFileInfo }
  | { ok: false; reason: SkipReason | FailReason; message?: string };

export interface ImagePipeline {
  estimate(request: PipelineRequest): Promise<EstimationOutcome>;
  /** The original bytes with their `ImageFileInfo` (US-005). */
  inspect(request: InspectPipelineRequest): Promise<FileResult>;
  /** Runs the estimation steps of `job` and returns the encoded bytes (US-005). */
  generate(request: PipelineRequest): Promise<FileResult>;
}

const MIME_TYPES: Partial<Record<ImageFormat, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};
const mimeTypeOf = (format: ImageFormat) => MIME_TYPES[format] ?? `image/${format}`;

/** Outcome of the shared core: everything `estimate` and `generate` need. */
type CoreResult =
  | {
      status: "done";
      sourceFormat: ImageFormat;
      target: EncodingSpec;
      sourceBytes: number;
      encoded: Uint8Array;
      natural: { width: number; height: number };
      output: { width: number; height: number };
    }
  | { status: "skipped" | "failed"; outcome: EstimationOutcome };

const stop = (outcome: EstimationOutcome): CoreResult => ({
  status: outcome.status === "skipped" ? "skipped" : "failed",
  outcome,
});

function sourceToBytes(source: ImageBytes): Uint8Array {
  return source.kind === "base64" ? decodeBase64(source.data) : new Uint8Array(source.data);
}

const failed = (reason: "bytes-unavailable" | "decode-failed" | "encode-failed", error?: unknown): EstimationOutcome => ({
  status: "failed",
  reason,
  ...(error === undefined ? {} : { message: error instanceof Error ? error.message : String(error) }),
});

const skipped = (
  reason: "too-large" | "unsupported-format" | "animated" | "already-optimised" | "not-an-image",
  sourceFormat?: ImageFormat,
): EstimationOutcome => ({ status: "skipped", reason, ...(sourceFormat ? { sourceFormat } : {}) });

/** Encoding applied by US-001: the image's own format, with the product settings. */
function ownFormatEncoding(format: DecodableFormat, bytes: Uint8Array): EncodingSpec {
  switch (format) {
    case "jpeg":
      return OWN_FORMAT_ENCODING.jpeg;
    case "png":
      return OWN_FORMAT_ENCODING.png;
    case "webp":
      return isLosslessWebp(bytes) ? OWN_FORMAT_ENCODING.webpLossless : OWN_FORMAT_ENCODING.webpLossy;
    case "avif":
      return OWN_FORMAT_ENCODING.avif;
  }
}

export function createImagePipeline(codecs: Codecs): ImagePipeline {
  /** Last decoded image: the (up to) three jobs of one URL decode once. */
  let last: { key: string; image: Promise<RawImage> } | undefined;

  const decodeOnce = (key: string, format: DecodableFormat, bytes: Uint8Array): Promise<RawImage> => {
    if (last?.key === key) return last.image;
    const image = Promise.resolve().then(() => codecs.decode(format, bytes));
    const entry = { key, image };
    last = entry;
    image.catch(() => {
      if (last === entry) last = undefined;
    });
    return image;
  };

  /** Detection, caps, encoding choice, decode, resize and encode: shared by `estimate` and `generate`. */
  const core = async ({ job, source }: PipelineRequest): Promise<CoreResult> => {
    let bytes: Uint8Array;
    try {
      bytes = sourceToBytes(source);
    } catch (error) {
      return stop(failed("bytes-unavailable", error));
    }
    if (bytes.length > MAX_IMAGE_BYTES) return stop(skipped("too-large"));

    const format = detectImageFormat(job.declaredType, bytes.subarray(0, 32));
    if (format === "unknown") {
      const mime = formatFromMime(job.declaredType);
      return stop(
        mime === "generic" || mime === undefined ? skipped("not-an-image") : skipped("unsupported-format", format),
      );
    }
    if (!CODEC_FORMATS.includes(format)) return stop(skipped("unsupported-format", format));
    const decodable = format as DecodableFormat;
    if (isAnimated(decodable, bytes)) return stop(skipped("animated", format));

    const transform = job.transform;
    let target: EncodingSpec;
    if (transform.kind === "resize") {
      target = ownFormatEncoding(decodable, bytes);
    } else {
      if (ALREADY_OPTIMISED_FORMATS.includes(format)) return stop(skipped("already-optimised", format));
      const recommended = RECOMMENDED_ENCODING[format];
      if (!recommended) return stop(skipped("unsupported-format", format));
      target = recommended;
    }

    const dimensions = readDimensions(decodable, bytes);
    if (dimensions && dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
      return stop(skipped("too-large", format));
    }

    let image: RawImage;
    try {
      image = await decodeOnce(`${job.url}|${bytes.length}`, decodable, bytes);
    } catch (error) {
      return stop(failed("decode-failed", error));
    }

    try {
      let pixels = image;
      if (
        transform.kind !== "convert" &&
        (transform.width < image.width || transform.height < image.height)
      ) {
        pixels = await codecs.resize(image, transform.width, transform.height);
      }
      const encoded = await codecs.encode(pixels, target);
      return {
        status: "done",
        sourceFormat: format,
        target,
        sourceBytes: bytes.length,
        encoded,
        natural: { width: image.width, height: image.height },
        output: { width: pixels.width, height: pixels.height },
      };
    } catch (error) {
      return stop(failed("encode-failed", error));
    }
  };

  const estimate = async (request: PipelineRequest): Promise<EstimationOutcome> => {
    const result = await core(request);
    if (result.status !== "done") return result.outcome;
    return {
      status: "estimated",
      sourceFormat: result.sourceFormat,
      target: result.target,
      sourceBytes: result.sourceBytes,
      encodedBytes: result.encoded.length,
      width: result.natural.width,
      height: result.natural.height,
    };
  };

  const generate = async (request: PipelineRequest): Promise<FileResult> => {
    const result = await core(request);
    if (result.status !== "done") {
      return result.outcome.status === "estimated"
        ? { ok: false, reason: "encode-failed" }
        : {
            ok: false,
            reason: result.outcome.reason,
            ...(result.outcome.status === "failed" && result.outcome.message !== undefined
              ? { message: result.outcome.message }
              : {}),
          };
    }
    const { target, encoded, output } = result;
    return {
      ok: true,
      bytes: encoded,
      info: {
        format: target.format,
        ...(target.format === "webp" ? { lossless: target.lossless } : {}),
        width: output.width,
        height: output.height,
        byteLength: encoded.length,
        mimeType: mimeTypeOf(target.format),
      },
    };
  };

  const inspect = async ({ declaredType, source }: InspectPipelineRequest): Promise<FileResult> => {
    let bytes: Uint8Array;
    try {
      bytes = sourceToBytes(source);
    } catch (error) {
      return { ok: false, reason: "bytes-unavailable", message: error instanceof Error ? error.message : String(error) };
    }
    if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: "too-large" };
    const format = detectImageFormat(declaredType, bytes.subarray(0, 32));
    if (format === "unknown") {
      const mime = formatFromMime(declaredType);
      return { ok: false, reason: mime === "generic" || mime === undefined ? "not-an-image" : "unsupported-format" };
    }
    if (!CODEC_FORMATS.includes(format)) return { ok: false, reason: "unsupported-format" };
    const decodable = format as DecodableFormat;
    let size = readDimensions(decodable, bytes);
    if (!size) {
      // No URL here, so the one-entry decode cache cannot be keyed safely: decode directly (rare).
      try {
        const image = await codecs.decode(decodable, bytes);
        size = { width: image.width, height: image.height };
      } catch (error) {
        return { ok: false, reason: "decode-failed", message: error instanceof Error ? error.message : String(error) };
      }
    }
    return {
      ok: true,
      bytes,
      info: {
        format,
        ...(format === "webp" ? { lossless: isLosslessWebp(bytes) } : {}),
        width: size.width,
        height: size.height,
        byteLength: bytes.length,
        mimeType: mimeTypeOf(format),
      },
    };
  };

  /** Public methods never reject: any unexpected throw becomes a failure. */
  const guard = async <T>(run: () => Promise<T>, fallback: (error: unknown) => T): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      return fallback(error);
    }
  };
  const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

  return {
    estimate: (request) => guard(() => estimate(request), (e) => failed("decode-failed", e)),
    generate: (request) =>
      guard(() => generate(request), (e) => ({ ok: false, reason: "decode-failed", message: message(e) })),
    inspect: (request) =>
      guard(() => inspect(request), (e) => ({ ok: false, reason: "decode-failed", message: message(e) })),
  };
}

export function createEstimationPipeline(codecs: Codecs): (request: PipelineRequest) => Promise<EstimationOutcome> {
  return createImagePipeline(codecs).estimate;
}
