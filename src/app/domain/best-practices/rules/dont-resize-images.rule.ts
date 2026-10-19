import {
  EstimationJob,
  ImageFinding,
} from "../../models/image-estimation";
import { NetworkRequest } from "../../models/network-request";
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from "../../image-estimation/policy";
import {
  findImageRequest,
  formatFromMime,
  normaliseImageUrl,
  originalBytesOf,
} from "../../image-estimation/image-requests";
import { BestPracticeRule, PlanningContext, RuleContext } from "../rule";
import { findingFromState, formatKo, fileLabel, summariseImageFindings } from "./image-rule-helpers";

export type ResizePageImage = {
  /** `currentSrc` (`srcset` and `<picture>` aware), else `src`. */
  src: string;
  /** Rendered box (`getBoundingClientRect`), in CSS pixels. */
  displayWidth: number;
  displayHeight: number;
  naturalWidth: number;
  naturalHeight: number;
};

export type ResizePageData = {
  /** `window.devicePixelRatio` of the screen at collection time (US-001 §2.2). */
  devicePixelRatio: number;
  images: ResizePageImage[];
};

/** An image of the page that may be resized: in scope, deduplicated by URL, largest display box. */
interface ResizeCandidate {
  url: string;
  declaredType: string;
  request: NetworkRequest | undefined;
  displayWidth: number;
  displayHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  /** Size needed on this screen; equals the natural size when the image is not oversized. */
  target: { width: number; height: number };
  oversized: boolean;
}

const RESIZABLE_FORMATS = ["jpeg", "png", "webp", "avif", "generic"];

function isOutOfScopeByUrl(src: string): boolean {
  if (/^data:image\/svg\+xml/i.test(src)) return true;
  return /\.(svg|gif)$/i.test(src.split("#")[0].split("?")[0]);
}

function densityOf(page: ResizePageData): number {
  return page.devicePixelRatio > 0 ? page.devicePixelRatio : 1;
}

/** Shared by `estimations` and `evaluate` (US-001 §2.2, §2.3, ARCH-DECISION-011 §1). */
function resizeCandidates(
  page: ResizePageData,
  requests: readonly NetworkRequest[]
): ResizeCandidate[] {
  const dpr = densityOf(page);
  const byUrl = new Map<string, ResizeCandidate>();
  for (const image of page.images) {
    if (!image.src || /^data:/i.test(image.src)) continue;
    const request = findImageRequest(requests, image.src);
    const declaredType = request?.type ?? "";
    if (declaredType !== "") {
      if (!RESIZABLE_FORMATS.includes(formatFromMime(declaredType) ?? "")) continue;
    } else if (isOutOfScopeByUrl(image.src)) {
      continue;
    }
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) continue;
    if (image.displayWidth <= 0 || image.displayHeight <= 0) continue;

    const requiredWidth = Math.ceil(image.displayWidth * dpr);
    const requiredHeight = Math.ceil(image.displayHeight * dpr);
    const factor = Math.max(
      requiredWidth / image.naturalWidth,
      requiredHeight / image.naturalHeight
    );
    const oversized = factor < 1;
    const candidate: ResizeCandidate = {
      url: normaliseImageUrl(image.src),
      declaredType,
      request,
      displayWidth: image.displayWidth,
      displayHeight: image.displayHeight,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      target: oversized
        ? {
            width: Math.max(1, Math.round(image.naturalWidth * factor)),
            height: Math.max(1, Math.round(image.naturalHeight * factor)),
          }
        : { width: image.naturalWidth, height: image.naturalHeight },
      oversized,
    };
    const known = byUrl.get(candidate.url);
    if (
      known === undefined ||
      candidate.displayWidth * candidate.displayHeight >
        known.displayWidth * known.displayHeight
    ) {
      byUrl.set(candidate.url, candidate);
    }
  }
  return [...byUrl.values()];
}

/** US-001 §5: too many pixels or bytes to be decoded in the panel's worker. */
function isTooLarge(candidate: ResizeCandidate): boolean {
  if (candidate.naturalWidth * candidate.naturalHeight > MAX_IMAGE_PIXELS) return true;
  const bytes = originalBytesOf(candidate.request);
  return bytes !== undefined && bytes > MAX_IMAGE_BYTES;
}

function jobOf(candidate: ResizeCandidate): EstimationJob {
  return {
    url: candidate.url,
    declaredType: candidate.declaredType,
    transform: { kind: "resize", ...candidate.target },
  };
}

/** `2`, `1.5`, `1.25`: up to two decimals, no trailing zeros, dot separator. */
function formatDensity(dpr: number): string {
  return `${Number(dpr.toFixed(2))}x`;
}

export const dontResizeImagesRule: BestPracticeRule<ResizePageData> = {
  id: "DontResizeImagesInBrowser",
  name: "Ne pas redimensionner les images dans le navigateur",
  category: "images",
  collect: () => ({
    devicePixelRatio: window.devicePixelRatio || 1,
    images: Array.from(document.querySelectorAll("img")).map((img) => {
      const box = img.getBoundingClientRect();
      return {
        src: img.currentSrc || img.src,
        displayWidth: box.width,
        displayHeight: box.height,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      };
    }),
  }),
  estimations: ({ page, requests }: PlanningContext<ResizePageData>) => {
    if (page === undefined) return [];
    return resizeCandidates(page, requests)
      .filter((c) => c.oversized && !isTooLarge(c))
      .map(jobOf);
  },
  evaluate: ({ page, requests, estimates }: RuleContext<ResizePageData>) => {
    if (page === undefined) {
      return {
        compliance: "A",
        detail: "La page n'a pas pu être inspectée",
      };
    }
    const dpr = densityOf(page);
    const candidates = resizeCandidates(page, requests);
    const oversized = candidates.filter((c) => c.oversized);
    const naturalOf = new Map(oversized.map((c) => [c.url, c]));

    const findings: ImageFinding[] = oversized.map((c) => {
      const base = { url: c.url, declaredType: c.declaredType, target: c.target };
      const known = originalBytesOf(c.request);
      if (isTooLarge(c)) {
        return findingFromState(base, { status: "skipped", reason: "too-large" }, known);
      }
      return findingFromState(base, estimates(jobOf(c)), known);
    });

    const extraEvaluatedBytes = candidates
      .filter((c) => !c.oversized)
      .reduce((sum, c) => sum + (originalBytesOf(c.request) ?? 0), 0);

    return summariseImageFindings(findings, {
      detailPrefix: `Densité d'écran : ${formatDensity(dpr)}\n`,
      extraEvaluatedBytes,
      offenderPhrase: (n) => `${n} image(s) surdimensionnée(s)`,
      noOffenderDetail: "Aucune image surdimensionnée",
      offenderLine: (f) => {
        const c = naturalOf.get(f.url)!;
        return (
          `${fileLabel(f.url)} : ${c.naturalWidth}×${c.naturalHeight} pour un affichage en ` +
          `${Math.round(c.displayWidth)}×${Math.round(c.displayHeight)} ` +
          `(×${formatDensity(dpr).slice(0, -1)} → ${f.target!.width}×${f.target!.height}), ` +
          `gain estimé ${formatKo(f.gainBytes!)}`
        );
      },
    });
  },
};
