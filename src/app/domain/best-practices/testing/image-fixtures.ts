import {
  EncodingSpec,
  EstimateLookup,
  EstimateState,
  EstimationJob,
  EstimationOutcome,
  ImageFormat,
  estimationKey,
} from "../../models/image-estimation";
import { NetworkRequest } from "../../models/network-request";

/** Test helper: a successful network request with sensible defaults. */
export function request(url: string, overrides: Partial<NetworkRequest> = {}): NetworkRequest {
  return {
    method: "GET",
    url: new URL(url),
    code: 200,
    type: "image/jpeg",
    responseSize: 0,
    transferSize: 0,
    ...overrides,
  };
}

/** Test helper: a fake EstimateLookup built from jobs and their states. */
export function lookupOf(entries: [EstimationJob, EstimateState][]): EstimateLookup {
  const map = new Map(entries.map(([job, state]) => [estimationKey(job), state]));
  return (job) => map.get(estimationKey(job));
}

export function estimated(
  sourceBytes: number,
  encodedBytes: number,
  extra: {
    sourceFormat?: ImageFormat;
    target?: EncodingSpec;
    width?: number;
    height?: number;
  } = {}
): EstimationOutcome {
  return {
    status: "estimated",
    sourceFormat: extra.sourceFormat ?? "jpeg",
    target: extra.target ?? { format: "jpeg", quality: 80 },
    sourceBytes,
    encodedBytes,
    width: extra.width ?? 1200,
    height: extra.height ?? 800,
  };
}
