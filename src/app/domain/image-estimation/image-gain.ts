import { BestPractice } from "../models/best-practice";
import {
  EstimateLookup,
  EstimationJob,
  ImageFinding,
  OPTIMISED_FORMATS_RULE_ID,
  PageImageGain,
  RESIZE_IMAGES_RULE_ID,
} from "../models/image-estimation";
import { NetworkRequest } from "../models/network-request";
import { findImageRequest, isTransferred, normaliseImageUrl } from "./image-requests";
import { NOISE_THRESHOLD_BYTES } from "./policy";

export interface ImageGainInput {
  requests: readonly NetworkRequest[];
  bestPractices: readonly BestPractice[];
  estimates: EstimateLookup;
}

interface ImagePair {
  url: string;
  resize?: ImageFinding;
  format?: ImageFinding;
}

/** Union of both rules' findings by URL, restricted to the images the page transferred. */
function transferredImages(input: ImageGainInput): ImagePair[] {
  const resizeRule = input.bestPractices.find((b) => b.id === RESIZE_IMAGES_RULE_ID);
  const formatRule = input.bestPractices.find((b) => b.id === OPTIMISED_FORMATS_RULE_ID);
  const pairs = new Map<string, ImagePair>();
  const add = (findings: ImageFinding[] | undefined, slot: "resize" | "format") => {
    for (const finding of findings ?? []) {
      const key = normaliseImageUrl(finding.url);
      const pair = pairs.get(key) ?? { url: finding.url };
      pair[slot] = finding;
      pairs.set(key, pair);
    }
  };
  add(resizeRule?.images, "resize");
  add(formatRule?.images, "format");
  return [...pairs.values()].filter((pair) =>
    isTransferred(findImageRequest(input.requests, pair.url))
  );
}

function combinedJobOf(pair: ImagePair): EstimationJob | undefined {
  const { resize, format } = pair;
  if (!resize?.offender || !format?.offender || !resize.target) return undefined;
  return {
    url: pair.url,
    declaredType: resize.declaredType || format.declaredType,
    transform: {
      kind: "resize-convert",
      width: resize.target.width,
      height: resize.target.height,
    },
  };
}

const isPending = (finding: ImageFinding | undefined) => finding?.state === "pending";

/** resize-convert jobs for the images that are offenders of both image rules. */
export function planCombinedEstimations(input: ImageGainInput): EstimationJob[] {
  const jobs: EstimationJob[] = [];
  for (const pair of transferredImages(input)) {
    if (isPending(pair.resize) || isPending(pair.format)) continue;
    const job = combinedJobOf(pair);
    if (job) jobs.push(job);
  }
  return jobs;
}

const counted = (gain: number) => (gain >= NOISE_THRESHOLD_BYTES ? gain : 0);

const notEvaluated = (finding: ImageFinding | undefined) =>
  finding !== undefined &&
  (finding.state === "failed" ||
    (finding.state === "skipped" &&
      (finding.reason === "too-large" || finding.reason === "analysis-stopped")));

/** Undefined when neither image rule is present in bestPractices. */
export function computePageImageGain(input: ImageGainInput): PageImageGain | undefined {
  const hasRule = input.bestPractices.some(
    (b) => b.id === RESIZE_IMAGES_RULE_ID || b.id === OPTIMISED_FORMATS_RULE_ID
  );
  if (!hasRule) return undefined;

  const total: PageImageGain = { bytes: 0, pendingCount: 0, notEvaluatedCount: 0, fallbackCount: 0 };

  for (const pair of transferredImages(input)) {
    const { resize, format } = pair;
    if (isPending(resize) || isPending(format)) {
      total.pendingCount++;
      continue;
    }

    const job = combinedJobOf(pair);
    if (job && resize && format) {
      const state = input.estimates(job);
      if (state === undefined || state.status === "pending") {
        total.pendingCount++;
      } else if (state.status === "estimated") {
        total.bytes += counted(Math.max(0, resize.originalBytes - state.encodedBytes));
      } else {
        total.bytes += counted(Math.max(resize.gainBytes ?? 0, format.gainBytes ?? 0));
        total.fallbackCount++;
      }
      continue;
    }

    const offender = [resize, format].find((f) => f?.offender);
    if (offender) {
      total.bytes += counted(offender.gainBytes ?? 0);
    } else if (notEvaluated(resize) || notEvaluated(format)) {
      total.notEvaluatedCount++;
    }
  }

  return total;
}
