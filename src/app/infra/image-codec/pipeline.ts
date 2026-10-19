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
  ImageFormat,
} from "../../domain/models/image-estimation";
import { decodeBase64 } from "./base64";
import { Codecs, RawImage } from "./codecs";
import { isAnimated, isLosslessWebp, readDimensions } from "./image-inspect";
import { ImageBytes } from "./worker-protocol";

type DecodableFormat = "jpeg" | "png" | "webp" | "avif";

export interface PipelineRequest {
  job: EstimationJob;
  source: ImageBytes;
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

export function createEstimationPipeline(codecs: Codecs): (request: PipelineRequest) => Promise<EstimationOutcome> {
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

  const estimate = async ({ job, source }: PipelineRequest): Promise<EstimationOutcome> => {
    let bytes: Uint8Array;
    try {
      bytes = source.kind === "base64" ? decodeBase64(source.data) : new Uint8Array(source.data);
    } catch (error) {
      return failed("bytes-unavailable", error);
    }
    if (bytes.length > MAX_IMAGE_BYTES) return skipped("too-large");

    const format = detectImageFormat(job.declaredType, bytes.subarray(0, 32));
    if (format === "unknown") {
      const mime = formatFromMime(job.declaredType);
      return mime === "generic" || mime === undefined ? skipped("not-an-image") : skipped("unsupported-format", format);
    }
    if (!CODEC_FORMATS.includes(format)) return skipped("unsupported-format", format);
    const decodable = format as DecodableFormat;
    if (isAnimated(decodable, bytes)) return skipped("animated", format);

    const transform = job.transform;
    let target: EncodingSpec;
    if (transform.kind === "resize") {
      target = ownFormatEncoding(decodable, bytes);
    } else {
      if (ALREADY_OPTIMISED_FORMATS.includes(format)) return skipped("already-optimised", format);
      const recommended = RECOMMENDED_ENCODING[format];
      if (!recommended) return skipped("unsupported-format", format);
      target = recommended;
    }

    const dimensions = readDimensions(decodable, bytes);
    if (dimensions && dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) return skipped("too-large", format);

    let image: RawImage;
    try {
      image = await decodeOnce(`${job.url}|${bytes.length}`, decodable, bytes);
    } catch (error) {
      return failed("decode-failed", error);
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
        status: "estimated",
        sourceFormat: format,
        target,
        sourceBytes: bytes.length,
        encodedBytes: encoded.length,
        width: image.width,
        height: image.height,
      };
    } catch (error) {
      return failed("encode-failed", error);
    }
  };

  return async (request) => {
    try {
      return await estimate(request);
    } catch (error) {
      return failed("decode-failed", error);
    }
  };
}
