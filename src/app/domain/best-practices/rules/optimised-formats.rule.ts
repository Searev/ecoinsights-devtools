import {
  EstimationJob,
  EstimateState,
  ImageFinding,
  OPTIMISED_FORMATS_RULE_ID,
} from "../../models/image-estimation";
import { NetworkRequest } from "../../models/network-request";
import { MAX_IMAGE_BYTES } from "../../image-estimation/policy";
import {
  formatFromMime,
  normaliseImageUrl,
  originalBytesOf,
} from "../../image-estimation/image-requests";
import { BestPracticeRule } from "../rule";
import {
  encodingLabel,
  fileLabel,
  findingFromState,
  formatKo,
  formatLabel,
  summariseImageFindings,
} from "./image-rule-helpers";

/** Images of the page, from its network requests (US-002 §2.1): no collector needed. */
function pageImages(requests: readonly NetworkRequest[]) {
  const byUrl = new Map<string, NetworkRequest>();
  for (const r of requests) {
    if (r.code < 200 || r.code >= 300) continue;
    byUrl.set(normaliseImageUrl(r.url.href), r);
  }
  const candidates: { url: string; request: NetworkRequest }[] = [];
  let compliantBytes = 0;
  for (const [url, request] of byUrl) {
    const format = formatFromMime(request.type);
    if (format === "jpeg" || format === "png" || format === "generic") {
      candidates.push({ url, request });
    } else if (format === "webp" || format === "avif") {
      compliantBytes += originalBytesOf(request) ?? 0;
    }
  }
  return { candidates, compliantBytes };
}

const jobOf = (url: string, request: NetworkRequest): EstimationJob => ({
  url,
  declaredType: request.type,
  transform: { kind: "convert" },
});

const isTooLarge = (request: NetworkRequest) =>
  (originalBytesOf(request) ?? 0) > MAX_IMAGE_BYTES;

export const optimisedFormatsRule: BestPracticeRule = {
  id: OPTIMISED_FORMATS_RULE_ID,
  name: "Utiliser des formats d'image optimisés",
  category: "images",
  estimations: ({ requests }) =>
    pageImages(requests)
      .candidates.filter((c) => !isTooLarge(c.request))
      .map((c) => jobOf(c.url, c.request)),
  evaluate: ({ requests, estimates }) => {
    const { candidates, compliantBytes } = pageImages(requests);
    const findings: ImageFinding[] = candidates.map(({ url, request }) => {
      const base = { url, declaredType: request.type, target: undefined };
      const known = originalBytesOf(request);
      let state: EstimateState | undefined;
      if (isTooLarge(request)) state = { status: "skipped", reason: "too-large" };
      else state = estimates(jobOf(url, request));
      const finding = findingFromState(base, state, known);
      delete finding.target;
      if (state?.status === "estimated") finding.encoding = state.target;
      return finding;
    });

    // Images already in WebP/AVIF, or found to be so by the codec, are evaluated and compliant.
    const optimisedBytes = findings
      .filter((f) => f.state === "skipped" && f.reason === "already-optimised")
      .reduce((sum, f) => sum + f.originalBytes, 0);

    const result = summariseImageFindings(findings, {
      detailPrefix: "",
      extraEvaluatedBytes: compliantBytes + optimisedBytes,
      offenderPhrase: (n) => `${n} image(s) à convertir`,
      noOffenderDetail:
        findings.length === 0
          ? "Toutes les images utilisent un format optimisé"
          : "Aucune conversion de format n'apporterait de gain significatif",
      offenderLine: (f) =>
        `${fileLabel(f.url)} : ${formatLabel(f.sourceFormat)} ${formatKo(f.originalBytes)} → ` +
        `${encodingLabel(f.encoding!)} ≈ ${formatKo(f.estimatedBytes!)}, gain estimé ${formatKo(f.gainBytes!)}`,
    });
    return result;
  },
};
