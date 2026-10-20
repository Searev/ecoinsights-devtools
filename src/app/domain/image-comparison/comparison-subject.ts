/**
 * Comparison subject of an offending image, derived from the persisted findings of a page
 * (ARCH-DECISION-013). Pure.
 */
import {
  classifyFinding,
  encodingLabel,
} from "../best-practices/rules/image-rule-helpers";
import { normaliseImageUrl } from "../image-estimation/image-requests";
import { BestPractice } from "../models/best-practice";
import {
  EstimationJob,
  ImageFinding,
  OPTIMISED_FORMATS_RULE_ID,
  RESIZE_IMAGES_RULE_ID,
} from "../models/image-estimation";
import { ComparisonSubject, ComparisonVersion } from "../models/image-variants";

/** Legacy findings: a change under this tolerance may be the headers included in the recorded weight. */
const MIN_CHANGE_TOLERANCE_BYTES = 2_000;
const CHANGE_TOLERANCE_PERCENT = 2;

function findingOf(
  bestPractices: readonly BestPractice[],
  ruleId: string,
  url: string
): ImageFinding | undefined {
  // Finding URLs are already normalised by the rules (ARCH-DECISION-011 §1): normalise the requested
  // URL once and compare by plain equality, without parsing every finding (this runs once per line).
  const key = normaliseImageUrl(url);
  return bestPractices
    .find((b) => b.id === ruleId)
    ?.images?.find((f) => f.url === key);
}

const isOffender = (f: ImageFinding | undefined): f is ImageFinding =>
  f !== undefined && classifyFinding(f) === "offender";

/** Undefined unless the finding of `ruleId` for `url` is an offender (only offenders are clickable). */
export function comparisonSubjectFor(
  bestPractices: readonly BestPractice[],
  ruleId: string,
  url: string
): ComparisonSubject | undefined {
  const resize = findingOf(bestPractices, RESIZE_IMAGES_RULE_ID, url);
  const format = findingOf(bestPractices, OPTIMISED_FORMATS_RULE_ID, url);
  const clicked =
    ruleId === RESIZE_IMAGES_RULE_ID ? resize : ruleId === OPTIMISED_FORMATS_RULE_ID ? format : undefined;
  if (!isOffender(clicked)) return undefined;

  const resizeOffender = isOffender(resize) && resize.target !== undefined ? resize : undefined;
  const formatOffender = isOffender(format) && format.encoding !== undefined ? format : undefined;

  const versions: ComparisonVersion[] = [{ id: "original", label: "Originale" }];
  if (resizeOffender) {
    versions.push({
      id: "resized",
      label: "Redimensionnée",
      job: {
        url: resizeOffender.url,
        declaredType: resizeOffender.declaredType,
        transform: { kind: "resize", ...resizeOffender.target! },
      },
      estimatedBytes: resizeOffender.estimatedBytes,
    });
  }
  if (formatOffender) {
    versions.push({
      id: "converted",
      label: encodingLabel(formatOffender.encoding!),
      job: {
        url: formatOffender.url,
        declaredType: formatOffender.declaredType,
        transform: { kind: "convert" },
      },
      estimatedBytes: formatOffender.estimatedBytes,
    });
  }
  if (resizeOffender && formatOffender) {
    // Same job as `planCombinedEstimations`, so that both share one estimation key.
    const job: EstimationJob = {
      url: resizeOffender.url,
      declaredType: resizeOffender.declaredType || formatOffender.declaredType,
      transform: { kind: "resize-convert", ...resizeOffender.target! },
    };
    versions.push({ id: "both", label: "Les deux", job });
  }

  const subject: ComparisonSubject = {
    url: clicked.url,
    declaredType: clicked.declaredType,
    ruleId,
    recordedBytes: clicked.originalBytes,
    versions,
  };
  if (clicked.sourceBytes !== undefined) subject.recordedSourceBytes = clicked.sourceBytes;
  const natural = resize?.natural ?? format?.natural;
  if (natural !== undefined) subject.natural = natural;
  const display = resize?.display ?? format?.display;
  if (display !== undefined) subject.display = display;
  return subject;
}

/**
 * True when the original now has another weight than during the analysis. Without the recorded body
 * length (legacy finding), only a difference over `max(2 000 bytes, 2 %)` of the recorded weight counts.
 */
export function hasImageChanged(subject: ComparisonSubject, currentByteLength: number): boolean {
  if (subject.recordedSourceBytes !== undefined) {
    return currentByteLength !== subject.recordedSourceBytes;
  }
  const recorded = subject.recordedBytes;
  if (recorded <= 0) return false;
  const difference = Math.abs(currentByteLength - recorded);
  if (difference <= MIN_CHANGE_TOLERANCE_BYTES) return false;
  return difference * 100 > recorded * CHANGE_TOLERANCE_PERCENT;
}

/**
 * Original size the dialog shows and computes every gain against: the weight recorded in the
 * analysis while the image is unchanged (same figure as the best-practice line), else the current one.
 */
export function referenceOriginalBytes(subject: ComparisonSubject, currentByteLength: number): number {
  if (subject.recordedBytes > 0 && !hasImageChanged(subject, currentByteLength)) {
    return subject.recordedBytes;
  }
  return currentByteLength;
}
