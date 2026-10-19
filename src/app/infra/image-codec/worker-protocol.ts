/**
 * Messages between the panel (`WorkerImageEstimator`) and the codec Web Worker (`codec.worker.ts`).
 * See docs/architecture/ARCH-DECISION-009. Structured-clone only; `binary` buffers are transferred.
 */
import {
  EstimationJob,
  EstimationOutcome,
} from "../../domain/models/image-estimation";

/**
 * Original image bytes as obtained by the panel. Base64 (DevTools `getContent`) is decoded in the
 * worker so that the panel's main thread never spends time on large strings.
 */
export type ImageBytes =
  | { kind: "base64"; data: string }
  | { kind: "binary"; data: ArrayBuffer };

/** Panel → worker. `id` is unique per worker instance. */
export interface CodecRequest {
  type: "estimate";
  id: number;
  job: EstimationJob;
  source: ImageBytes;
}

/** Worker → panel. Exactly one response per request; the worker never throws across the boundary. */
export interface CodecResponse {
  type: "result";
  id: number;
  outcome: EstimationOutcome;
}

/** Minimal subset of `Worker` used by the panel side, so tests can inject a fake. */
export interface WorkerLike {
  postMessage(message: CodecRequest, transfer?: Transferable[]): void;
  onmessage: ((event: { data: CodecResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  terminate(): void;
}
