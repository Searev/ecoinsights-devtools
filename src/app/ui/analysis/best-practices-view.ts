import {
  BestPractice,
  BestPracticeCategory,
  BestPracticeCompliance,
  BestPracticeId,
} from "../../domain/models/best-practice";
import {
  EstimationProgress,
  ImageFinding,
} from "../../domain/models/image-estimation";
import { ComparisonSubject } from "../../domain/models/image-variants";
import { comparisonSubjectFor } from "../../domain/image-comparison/comparison-subject";
import { PageAnalysis } from "../../domain/models/page-analysis";
import {
  fileLabel,
  lineFindings,
} from "../../domain/best-practices/rules/image-rule-helpers";
import { DisplayImageName, displayImageName } from "./image-name";

/** One line of the "Éléments concernés" list (ARCH-DECISION-015). */
export type BestPracticeLine =
  | { kind: "text"; text: string }
  | {
      kind: "image";
      /** Persisted line, used as the dedupe key across pages. */
      text: string;
      ruleId: string;
      url: string;
      name: DisplayImageName;
      /** Text after "<fileLabel> : ", displayed after the name. */
      rest: string;
      finding: ImageFinding;
      /** Set for offenders only (US-005): what the comparison dialog needs. */
      comparison?: ComparisonSubject;
    };

export interface AggregatedBestPractice {
  id: BestPracticeId;
  name: string;
  category: BestPracticeCategory;
  /** Worst defined grade across pages; undefined only if no page could evaluate the rule. */
  compliance?: BestPracticeCompliance;
  detail: string;
  /** Titles of the pages that do not fully comply (or could not be evaluated). */
  pages: string[];
  offenders: string[];
  /** One per offender string (same order, same dedupe), with image lines built from findings. */
  lines: BestPracticeLine[];
  error?: string;
  /** Summed over the pages still estimating; the grade is undefined while it is set. */
  progress?: EstimationProgress;
}

export function describeProgress(progress: EstimationProgress): string {
  return `Estimation en cours… (${progress.done}/${progress.total} images)`;
}

export const CATEGORY_ORDER: BestPracticeCategory[] = [
  "content",
  "images",
  "fonts",
  "network",
  "css",
  "js",
];

export const CATEGORY_LABELS: Record<BestPracticeCategory, string> = {
  content: "Contenu",
  images: "Images",
  fonts: "Polices",
  network: "Réseau",
  css: "CSS",
  js: "JavaScript",
};

/** The worst defined grade wins ("C" > "B" > "A"); undefined never wins over a defined grade. */
export function worstCompliance(
  a: BestPracticeCompliance | undefined,
  b: BestPracticeCompliance | undefined
): BestPracticeCompliance | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a >= b ? a : b;
}

export function aggregateBestPractices(
  pages: PageAnalysis[]
): AggregatedBestPractice[] {
  const map = new Map<BestPracticeId, AggregatedBestPractice>();
  for (const page of pages) {
    for (const bp of page.bestPractices ?? []) {
      const current = map.get(bp.id);
      const entry = current ?? createEntry(bp);
      if (current) {
        const worse = worstCompliance(current.compliance, bp.compliance);
        if (worse !== current.compliance || current.compliance === undefined) {
          // This page is the new reference for the detail text.
          if (bp.compliance !== undefined) {
            entry.detail = bp.detail;
            entry.error = bp.error;
          }
        }
        entry.compliance = worse;
      }
      if (bp.compliance !== "A") entry.pages.push(page.title);
      const pageLines = buildLines(page, bp);
      for (const line of pageLines) {
        if (entry.offenders.includes(line.text)) continue;
        entry.offenders.push(line.text);
        entry.lines.push(line);
      }
      if (bp.progress !== undefined) {
        entry.progress = {
          done: (entry.progress?.done ?? 0) + bp.progress.done,
          total: (entry.progress?.total ?? 0) + bp.progress.total,
        };
      }
      map.set(bp.id, entry);
    }
  }
  const result = Array.from(map.values());
  // No grade while estimating (US-001 S8).
  for (const entry of result) {
    if (entry.progress !== undefined) entry.compliance = undefined;
  }
  return result;
}

function createEntry(bp: BestPractice): AggregatedBestPractice {
  return {
    id: bp.id,
    name: bp.name,
    category: bp.category ?? "content",
    compliance: bp.compliance,
    detail: bp.detail,
    pages: [],
    offenders: [],
    lines: [],
    error: bp.error,
  };
}

/** Pairs each persisted offender string with its image finding when the line still matches it. */
function buildLines(page: PageAnalysis, bp: BestPractice): BestPracticeLine[] {
  const offenders = bp.offenders ?? [];
  const findings = bp.images !== undefined ? lineFindings(bp.images) : [];
  return offenders.map((text, index): BestPracticeLine => {
    const finding = findings[index];
    if (finding === undefined) return { kind: "text", text };
    const prefix = `${fileLabel(finding.url)} : `;
    if (!text.startsWith(prefix)) return { kind: "text", text };
    const line: BestPracticeLine = {
      kind: "image",
      text,
      ruleId: bp.id,
      url: finding.url,
      name: displayImageName(finding.url),
      rest: text.slice(prefix.length),
      finding,
    };
    const comparison = comparisonSubjectFor(page.bestPractices ?? [], bp.id, finding.url);
    if (comparison !== undefined) line.comparison = comparison;
    return line;
  });
}

export function groupByCategory(
  items: AggregatedBestPractice[]
): Array<{ category: BestPracticeCategory; items: AggregatedBestPractice[] }> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: items.filter((el) => el.category === category),
  })).filter((group) => group.items.length > 0);
}
