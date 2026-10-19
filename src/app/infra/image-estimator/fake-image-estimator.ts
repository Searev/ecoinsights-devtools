import { OWN_FORMAT_ENCODING, RECOMMENDED_ENCODING } from "../../domain/image-estimation/policy";
import { formatFromMime } from "../../domain/image-estimation/image-requests";
import {
  EncodingSpec,
  EstimationJob,
  EstimationOutcome,
  ImageFormat,
} from "../../domain/models/image-estimation";
import { ImageEstimator } from "../../domain/models/image-estimator";

/** Dev-only estimator (`npm run dev`): no worker, no WASM; every image goes from 100 kB to 40 kB. */
export class FakeImageEstimator implements ImageEstimator {
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
}
