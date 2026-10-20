import { OWN_FORMAT_ENCODING, RECOMMENDED_ENCODING } from "../../domain/image-estimation/policy";
import { formatFromMime } from "../../domain/image-estimation/image-requests";
import {
  EncodingSpec,
  EstimationJob,
  EstimationOutcome,
  ImageFormat,
} from "../../domain/models/image-estimation";
import { ImageEstimator } from "../../domain/models/image-estimator";
import { ImageFileResult, ImageVariantGenerator } from "../../domain/models/image-variants";

const FAKE_ORIGINAL_BYTES = 100_000;
const FAKE_VARIANT_BYTES = 40_000;
const FAKE_SIZE = 1000;

/** A small deterministic SVG of the given pixel size, displayable from a blob: URL. */
function syntheticSvg(width: number, height: number, label: string): Uint8Array {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="${label === "original" ? "#7aa7d9" : "#7ad9a7"}"/>` +
    `<text x="50%" y="50%" font-size="${Math.max(12, Math.round(width / 12))}" text-anchor="middle" fill="#fff">${label} ${width}x${height}</text>` +
    `</svg>`;
  return new TextEncoder().encode(svg);
}

const loaded = (width: number, height: number, byteLength: number, label: string): ImageFileResult => ({
  status: "loaded",
  bytes: syntheticSvg(width, height, label),
  info: { format: "svg", width, height, byteLength, mimeType: "image/svg+xml" },
});

/**
 * Dev-only estimator and variant generator (`npm run dev`): no worker, no WASM, no network.
 * Every image goes from 100 kB to 40 kB; comparison images are synthetic SVGs.
 */
export class FakeImageEstimator implements ImageEstimator, ImageVariantGenerator {
  async estimate(job: EstimationJob): Promise<EstimationOutcome> {
    const fromMime = formatFromMime(job.declaredType);
    const sourceFormat: ImageFormat =
      fromMime === undefined || fromMime === "generic" || fromMime === "unknown" ? "jpeg" : fromMime;
    const own: EncodingSpec =
      sourceFormat === "png"
        ? OWN_FORMAT_ENCODING.png
        : sourceFormat === "webp"
          ? OWN_FORMAT_ENCODING.webpLossy
          : sourceFormat === "avif"
            ? OWN_FORMAT_ENCODING.avif
            : OWN_FORMAT_ENCODING.jpeg;
    const target =
      job.transform.kind === "resize" ? own : (RECOMMENDED_ENCODING[sourceFormat] ?? own);
    return {
      status: "estimated",
      sourceFormat,
      target,
      sourceBytes: 100_000,
      encodedBytes: 40_000,
      width: 1000,
      height: 1000,
    };
  }

  async loadOriginal(): Promise<ImageFileResult> {
    return loaded(FAKE_SIZE, FAKE_SIZE, FAKE_ORIGINAL_BYTES, "original");
  }

  async generate(job: EstimationJob): Promise<ImageFileResult> {
    const t = job.transform;
    const resized = t.kind === "resize" || t.kind === "resize-convert";
    return loaded(resized ? t.width : FAKE_SIZE, resized ? t.height : FAKE_SIZE, FAKE_VARIANT_BYTES, t.kind);
  }
}
