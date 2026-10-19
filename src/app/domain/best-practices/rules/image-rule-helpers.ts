/**
 * Pure helpers shared by the two image rules (US-001, US-002).
 * See docs/architecture/ARCH-DECISION-011. Not part of any `collect`: this file is never serialised.
 */
import { BestPracticeCompliance } from "../../models/best-practice";
import {
  EncodingSpec,
  EstimateState,
  FailReason,
  ImageFinding,
  ImageFormat,
  SkipReason,
} from "../../models/image-estimation";
import {
  GRADE_B_MIN_SHARE,
  GRADE_C_ABOVE_SHARE,
  MAX_OFFENDER_LINES,
  NOISE_THRESHOLD_BYTES,
} from "../../image-estimation/policy";
import { RuleResult } from "../rule";

/** Integer comparisons so the 10 % and 30 % boundaries are exact (ARCH-DECISION-011 §3). */
export function gradeByShare(
  gainBytes: number,
  evaluatedBytes: number
): BestPracticeCompliance {
  if (evaluatedBytes <= 0) return "A";
  // Shares are expressed in tenths so that the comparison stays on integers.
  const bTenths = Math.round(GRADE_B_MIN_SHARE * 10);
  const cTenths = Math.round(GRADE_C_ABOVE_SHARE * 10);
  if (gainBytes * 10 < evaluatedBytes * bTenths) return "A";
  if (gainBytes * 10 <= evaluatedBytes * cTenths) return "B";
  return "C";
}

/** "180 ko": 1 kB = 1 000 bytes, no decimals, French grouping. */
export function formatKo(bytes: number): string {
  return `${Math.round(bytes / 1000).toLocaleString("fr-FR")} ko`;
}

/** Last non-empty path segment, URI-decoded; the host when the path is empty. */
export function fileLabel(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const segment = parsed.pathname.split("/").filter((s) => s !== "").pop();
  if (segment === undefined) return parsed.host;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

const NOT_EVALUATED_LABELS: Record<SkipReason | FailReason, string> = {
  "too-large": "image trop volumineuse",
  "bytes-unavailable": "contenu de l'image indisponible",
  "decode-failed": "échec du décodage",
  "encode-failed": "échec de l'encodage",
  timeout: "délai d'estimation dépassé",
  "estimator-unavailable": "estimation indisponible",
  "analysis-stopped": "analyse arrêtée",
  // Out-of-scope skips are never displayed; kept for exhaustiveness.
  "unsupported-format": "format non pris en charge",
  animated: "image animée",
  "already-optimised": "déjà optimisée",
  "not-an-image": "ce n'est pas une image",
};

export function notEvaluatedLabel(reason: SkipReason | FailReason): string {
  return NOT_EVALUATED_LABELS[reason];
}

/** Caps the lines at `MAX_OFFENDER_LINES` then appends "… et N autres images". */
export function offenderLines(lines: readonly string[]): string[] {
  if (lines.length <= MAX_OFFENDER_LINES) return [...lines];
  const rest = lines.length - MAX_OFFENDER_LINES;
  return [
    ...lines.slice(0, MAX_OFFENDER_LINES),
    rest === 1 ? "… et 1 autre image" : `… et ${rest} autres images`,
  ];
}

/** Skips that are out of scope: neither listed nor counted. */
const OUT_OF_SCOPE: readonly (SkipReason | FailReason | undefined)[] = [
  "unsupported-format",
  "animated",
  "not-an-image",
  "already-optimised",
];

/** Builds the finding fields shared by both rules from the state of an estimation. */
export function findingFromState(
  base: Pick<ImageFinding, "url" | "declaredType" | "target">,
  state: EstimateState | undefined,
  knownOriginalBytes: number | undefined
): ImageFinding {
  const stateOf = state ?? { status: "pending" as const };
  if (stateOf.status === "estimated") {
    const originalBytes = knownOriginalBytes ?? stateOf.sourceBytes;
    const gainBytes = Math.max(0, originalBytes - stateOf.encodedBytes);
    return {
      ...base,
      originalBytes,
      state: "estimated",
      estimatedBytes: stateOf.encodedBytes,
      gainBytes,
      offender: gainBytes >= NOISE_THRESHOLD_BYTES,
      sourceFormat: stateOf.sourceFormat,
    };
  }
  const finding: ImageFinding = {
    ...base,
    originalBytes: knownOriginalBytes ?? 0,
    state: stateOf.status,
    offender: false,
  };
  if (stateOf.status === "skipped") {
    finding.reason = stateOf.reason;
    if (stateOf.sourceFormat !== undefined) finding.sourceFormat = stateOf.sourceFormat;
  } else if (stateOf.status === "failed") {
    finding.reason = stateOf.reason;
  }
  return finding;
}

export type FindingKind =
  | "pending"
  | "offender"
  | "evaluated"
  | "not-evaluated"
  | "out-of-scope";

export function classifyFinding(f: ImageFinding): FindingKind {
  if (f.state === "pending") return "pending";
  if (f.state === "estimated") return f.offender ? "offender" : "evaluated";
  if (f.state === "failed") return "not-evaluated";
  return OUT_OF_SCOPE.includes(f.reason) ? "out-of-scope" : "not-evaluated";
}

export interface SummaryOptions {
  /** Prepended to every detail (e.g. the screen density line). */
  detailPrefix: string;
  /** Weight of the evaluated images that are not findings (correctly sized, already optimised…). */
  extraEvaluatedBytes: number;
  /** Singular/plural phrase for the graded detail: "2 image(s) surdimensionnée(s)". */
  offenderPhrase: (count: number) => string;
  /** Detail when no offender was found. */
  noOffenderDetail: string;
  /** Line of an offender finding. */
  offenderLine: (finding: ImageFinding) => string;
}

/** Turns the findings of an image rule into its RuleResult (pending, graded or not evaluated). */
export function summariseImageFindings(
  findings: readonly ImageFinding[],
  options: SummaryOptions
): RuleResult {
  const images = [...findings];
  const pending = findings.filter((f) => f.state === "pending").length;
  if (pending > 0) {
    const total = findings.length;
    return {
      detail: `${options.detailPrefix}Estimation en cours… (${total - pending}/${total} images)`,
      progress: { done: total - pending, total },
      images,
    };
  }

  const offenders = findings
    .filter((f) => classifyFinding(f) === "offender")
    .sort((a, b) => b.gainBytes! - a.gainBytes! || a.url.localeCompare(b.url));
  const notEvaluated = findings.filter((f) => classifyFinding(f) === "not-evaluated");
  const evaluatedBytes =
    options.extraEvaluatedBytes +
    findings
      .filter((f) => f.state === "estimated")
      .reduce((sum, f) => sum + f.originalBytes, 0);

  if (evaluatedBytes === 0 && notEvaluated.length > 0) {
    return {
      detail: `${options.detailPrefix}Non évaluée : aucune image n'a pu être estimée`,
      offenders: offenderLines(notEvaluated.map(notEvaluatedLine)),
      images,
    };
  }

  const gain = offenders.reduce((sum, f) => sum + f.gainBytes!, 0);
  const lines = [...offenders.map(options.offenderLine), ...notEvaluated.map(notEvaluatedLine)];
  const result: RuleResult = {
    compliance: gradeByShare(gain, evaluatedBytes),
    detail:
      offenders.length === 0
        ? `${options.detailPrefix}${options.noOffenderDetail}`
        : `${options.detailPrefix}${options.offenderPhrase(offenders.length)}, gain estimé ${formatKo(gain)} (${Math.round((gain * 100) / evaluatedBytes)} % du poids des images)`,
    images,
  };
  if (lines.length > 0) result.offenders = offenderLines(lines);
  return result;
}

function notEvaluatedLine(f: ImageFinding): string {
  return `${fileLabel(f.url)} : non évaluée (${notEvaluatedLabel(f.reason as SkipReason | FailReason)})`;
}

/** Display names of the formats in offender lines. */
export function formatLabel(format: ImageFormat | undefined): string {
  return format === undefined || format === "unknown" ? "image" : format.toUpperCase();
}

export function encodingLabel(spec: EncodingSpec): string {
  switch (spec.format) {
    case "jpeg":
      return "JPEG";
    case "png":
      return "PNG";
    case "avif":
      return "AVIF";
    case "webp":
      return spec.lossless ? "WebP sans perte" : "WebP";
  }
}
