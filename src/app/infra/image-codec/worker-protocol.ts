/**
 * Messages between the panel (`WorkerImageEstimator`) and the codec Web Worker (`codec.worker.ts`).
 * See docs/architecture/ARCH-DECISION-009 and 012. Structured-clone only; `binary` buffers are
 * transferred, never copied.
 */
import {
  EstimationJob,
  EstimationOutcome,
  FailReason,
  SkipReason,
} from "../../domain/models/image-estimation";
import { ImageFileInfo } from "../../domain/models/image-variants";

/**
 * Original image bytes as obtained by the panel. Base64 (DevTools `getContent`) is decoded in the
 * worker so that the panel's main thread never spends time on large strings.
 */
export type ImageBytes =
  | { kind: "base64"; data: string }
  | { kind: "binary"; data: ArrayBuffer };

/** Estimation (US-001 to US-003): sizes only, the encoded bytes never leave the worker. */
export interface EstimateRequest {
  type: "estimate";
  id: number;
  job: EstimationJob;
  source: ImageBytes;
}

/**
 * Comparison (US-005): reads the original. The worker decodes base64 if needed, detects the format
 * and the pixel size, and sends the bytes back (transferred) with their `ImageFileInfo`.
 */
export interface InspectRequest {
  type: "inspect";
  id: number;
  /** Response MIME type ("" when unknown), used like in the estimation to detect the format. */
  declaredType: string;
  source: ImageBytes;
}

/**
 * Comparison (US-005): runs exactly the estimation steps of `job` on `source` and sends the
 * encoded bytes back (transferred) with their `ImageFileInfo`.
 */
export interface GenerateRequest {
  type: "generate";
  id: number;
  job: EstimationJob;
  source: ImageBytes;
}

/** Panel → worker. `id` is unique per worker instance, across request types. */
export type CodecRequest = EstimateRequest | InspectRequest | GenerateRequest;

/** Result of an `inspect` or `generate` request. */
export type CodecFileResult =
  | { ok: true; bytes: ArrayBuffer; info: ImageFileInfo }
  | { ok: false; reason: SkipReason | FailReason; message?: string };

/** Worker → panel, answer to an `estimate` request. */
export interface EstimateResponse {
  type: "result";
  id: number;
  outcome: EstimationOutcome;
}

/** Worker → panel, answer to an `inspect` or `generate` request. */
export interface FileResponse {
  type: "file";
  id: number;
  result: CodecFileResult;
}

/** Exactly one response per request; the worker never throws across the boundary. */
export type CodecResponse = EstimateResponse | FileResponse;

/** Minimal subset of `Worker` used by the panel side, so tests can inject a fake. */
export interface WorkerLike {
  postMessage(message: CodecRequest, transfer?: Transferable[]): void;
  onmessage: ((event: { data: CodecResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  terminate(): void;
}
