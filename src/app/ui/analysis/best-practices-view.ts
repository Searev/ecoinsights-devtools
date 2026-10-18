import {
  BestPractice,
  BestPracticeCategory,
  BestPracticeCompliance,
  BestPracticeId,
} from "../../domain/models/best-practice";
import { PageAnalysis } from "../../domain/models/page-analysis";

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
  error?: string;
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
      for (const offender of bp.offenders ?? []) {
        if (!entry.offenders.includes(offender)) entry.offenders.push(offender);
      }
      map.set(bp.id, entry);
    }
  }
  return Array.from(map.values());
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
    error: bp.error,
  };
}

export function groupByCategory(
  items: AggregatedBestPractice[]
): Array<{ category: BestPracticeCategory; items: AggregatedBestPractice[] }> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: items.filter((el) => el.category === category),
  })).filter((group) => group.items.length > 0);
}
