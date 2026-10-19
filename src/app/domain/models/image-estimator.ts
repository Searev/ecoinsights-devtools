import { EstimationJob, EstimationOutcome } from "./image-estimation";

/**
 * Port: estimates the size of an image after a transformation, by real encoding.
 * Adapters live in `src/app/infra/image-estimator/` (Web Worker + WASM codecs, or a fake for dev).
 * See docs/architecture/ARCH-DECISION-007 and 009.
 *
 * Contract rules:
 * - `estimate` never rejects: every failure is an `EstimationOutcome` with status `failed` or `skipped`.
 * - The adapter obtains the image bytes itself (ARCH-DECISION-010); it never adds requests to the
 *   inspected page.
 * - Scheduling (queue, cache, concurrency) belongs to the domain `EstimationQueue`, not to the adapter.
 */
export interface ImageEstimator {
  estimate(job: EstimationJob): Promise<EstimationOutcome>;
  /**
   * Optional: aborts the work in progress (e.g. terminates the worker) when the analysis stops.
   * Pending `estimate` promises must still settle (any outcome; the caller ignores it).
   */
  cancel?(): void;
}
