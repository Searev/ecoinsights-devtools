/**
 * Line helpers shared by the BP2 rules (US-006 to US-014, EPIC-BP2 §5 and §9).
 * See docs/architecture/ARCH-DECISION-017. Not part of any `collect`: this file is never serialised.
 */
import { LinePreview, LineRef } from "../../models/best-practice";
import { MAX_OFFENDER_LINES } from "../../image-estimation/policy";
import { fileLabel } from "./image-rule-helpers";

/** One line of a rule result, with the file it names when there is one. */
export interface RuleLine {
  text: string;
  ref?: LineRef;
}

/**
 * A line naming a file: `prefix + fileLabel(url) + rest`. `rest` carries its own separator
 * (" : …" or " (JS, 250 ko) : …"). The UI shortens the name (US-004) using `ref`. `preview`
 * (EPIC-PV, ARCH-DECISION-020) makes the name a button opening the file preview.
 */
export function fileLine(url: string, rest: string, prefix = "", preview?: LinePreview): RuleLine {
  const ref: LineRef = prefix === "" ? { url } : { url, prefix };
  if (preview !== undefined) ref.preview = preview;
  return { text: `${prefix}${fileLabel(url)}${rest}`, ref };
}

/**
 * Caps the lines at `MAX_OFFENDER_LINES` (20) then appends "… et N autres", and builds the
 * `offenders` / `lineRefs` pair of a `RuleResult` (spread it into the result). `lineRefs` is omitted when no line names a file.
 * Lines must already be sorted.
 */
export function capLines(
  lines: readonly RuleLine[],
  max: number = MAX_OFFENDER_LINES
): { offenders: string[]; lineRefs?: (LineRef | null)[] } {
  const kept = lines.slice(0, max);
  const offenders = kept.map((line) => line.text);
  const refs: (LineRef | null)[] = kept.map((line) => line.ref ?? null);
  const hidden = lines.length - kept.length;
  if (hidden > 0) {
    offenders.push(hidden === 1 ? "… et 1 autre" : `… et ${hidden} autres`);
    refs.push(null);
  }
  return refs.some((ref) => ref !== null) ? { offenders, lineRefs: refs } : { offenders };
}

/** French agreement: singular for 0 and 1. */
export function plural(count: number, singular: string, pluralForm: string): string {
  return count <= 1 ? singular : pluralForm;
}

/** Integer with French digit grouping ("1 500"), same convention as `formatKo`. */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("fr-FR");
}
