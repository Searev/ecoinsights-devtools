import {
  BestPractice,
  BestPracticeCategory,
  BestPracticeCompliance,
  BestPracticeId,
  BestPracticeIndicator,
  CountIndicatorUnit,
  RatioIndicatorUnit,
} from "../../domain/models/best-practice";
import { formatCount, plural } from "../../domain/best-practices/rules/rule-lines";
import {
  EstimationProgress,
  ImageFinding,
} from "../../domain/models/image-estimation";
import { ComparisonSubject } from "../../domain/models/image-variants";
import { comparisonSubjectFor } from "../../domain/image-comparison/comparison-subject";
import { PageAnalysis } from "../../domain/models/page-analysis";
import { PreviewSubject } from "../../domain/models/file-preview";
import { createPreviewSubjectResolver } from "../../domain/file-preview/preview-subject";
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
    }
  | {
      /** Non-image line naming a file (ARCH-DECISION-017): `prefix`, shortened name, `rest`. */
      kind: "file";
      text: string;
      prefix: string;
      ruleId: string;
      /** `LineRef.url`, the dialog key with `ruleId`. */
      url: string;
      name: DisplayImageName;
      rest: string;
      /** Set when the file can be previewed (EPIC-PV, ARCH-DECISION-020). */
      preview?: PreviewSubject;
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
  /** US-029: formatted journey indicator; absent while the rule has progress or when no page has one. */
  indicator?: string;
  /** US-029: parallel to `pages` (same index): the formatted indicator of that page, if any. */
  pageIndicators: (string | undefined)[];
}

const RATIO_LABELS: Record<RatioIndicatorUnit, readonly [string, string]> = {
  "uncached-files": ["ressource sans cache", "ressources sans cache"],
  "autoplay-media": ["média en lecture ou chargement automatique", "médias en lecture ou chargement automatique"],
  "uncompressed-files": ["fichier non compressé", "fichiers non compressés"],
  "resized-images": ["image redimensionnée", "images redimensionnées"],
  "unminified-files": ["fichier non minifié", "fichiers non minifiés"],
  "unoptimised-images": ["image au format non optimisé", "images au format non optimisé"],
  "http1-requests": ["requête HTTP/1", "requêtes HTTP/1"],
  "missing-alternatives": ["contenu sans alternative textuelle", "contenus sans alternative textuelle"],
};

const COUNT_LABELS: Record<CountIndicatorUnit, readonly [string, string]> = {
  "inline-blocks": ["bloc CSS ou JavaScript en ligne", "blocs CSS ou JavaScript en ligne"],
  "canvas-elements": ["élément canvas", "éléments canvas"],
  "css-files": ["fichier CSS", "fichiers CSS"],
  domains: ["domaine", "domaines"],
  "gif-files": ["fichier GIF", "fichiers GIF"],
  requests: ["requête HTTP", "requêtes HTTP"],
  "custom-fonts": ["fichier de police personnalisé", "fichiers de police personnalisés"],
};

const PRESENCE_LABELS = { "print-css": { label: "CSS print", absent: "absente" } } as const;

function percentage(offenders: number, expected: number): string {
  const p = Math.round((100 * offenders) / expected);
  if (offenders > 0 && p === 0) return "< 1";
  if (offenders < expected && p === 100) return "> 99";
  return String(p);
}

/** US-029: the wording of one indicator. The unit agrees with `expected` (ratio) or the count. */
export function formatIndicator(indicator: BestPracticeIndicator): string {
  switch (indicator.kind) {
    case "ratio": {
      const { offenders, expected } = indicator;
      if (expected === 0) return "Aucun élément à vérifier";
      const [one, many] = RATIO_LABELS[indicator.unit];
      return `${formatCount(offenders)} / ${formatCount(expected)} ${plural(expected, one, many)} (${percentage(offenders, expected)} %)`;
    }
    case "count": {
      const [one, many] = COUNT_LABELS[indicator.unit];
      return `${formatCount(indicator.offenders)} ${plural(indicator.offenders, one, many)}`;
    }
    case "presence":
      return `${PRESENCE_LABELS[indicator.unit].label} : ${indicator.present ? "oui" : "non"}`;
  }
}

/**
 * US-029: the journey indicator of one rule. Only indicators of the first one's kind and unit are
 * kept; ratios are summed, counts take the worst page, presence reports the pages lacking it.
 */
export function journeyIndicator(indicators: readonly BestPracticeIndicator[]): string | undefined {
  const first = indicators[0];
  if (first === undefined) return undefined;
  const same = indicators.filter((i) => i.kind === first.kind && i.unit === first.unit);
  switch (first.kind) {
    case "ratio": {
      let offenders = 0;
      let expected = 0;
      for (const i of same) {
        if (i.kind !== "ratio") continue;
        offenders += i.offenders;
        expected += i.expected;
      }
      return formatIndicator({ kind: "ratio", offenders, expected, unit: first.unit });
    }
    case "count": {
      let worst = 0;
      for (const i of same) if (i.kind === "count") worst = Math.max(worst, i.offenders);
      const text = formatIndicator({ kind: "count", offenders: worst, unit: first.unit });
      return same.length > 1 ? `${text} (page la plus chargée)` : text;
    }
    case "presence": {
      const absent = same.filter((i) => i.kind === "presence" && !i.present).length;
      const { label, absent: word } = PRESENCE_LABELS[first.unit];
      if (absent === 0) return `${label} : oui`;
      if (same.length === 1) return `${label} : non`;
      return `${label} ${word} sur ${absent} ${plural(absent, "page", "pages")} sur ${same.length}`;
    }
  }
}

export function describeProgress(progress: EstimationProgress): string {
  return progress.unit === "files"
    ? `Analyse en cours… (${progress.done}/${progress.total} fichiers)`
    : `Estimation en cours… (${progress.done}/${progress.total} images)`;
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
  const indicators = new Map<BestPracticeId, BestPracticeIndicator[]>();
  for (const page of pages) {
    const resolve = lazyResolver(page);
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
      const indicator = bp.compliance !== undefined ? bp.indicator : undefined;
      if (indicator !== undefined) {
        const list = indicators.get(bp.id);
        if (list) list.push(indicator);
        else indicators.set(bp.id, [indicator]);
      }
      if (bp.compliance !== "A") {
        entry.pages.push(page.title);
        entry.pageIndicators.push(indicator === undefined ? undefined : formatIndicator(indicator));
      }
      const pageLines = buildLines(page, bp, resolve);
      for (const line of pageLines) {
        if (entry.offenders.includes(line.text)) continue;
        entry.offenders.push(line.text);
        entry.lines.push(line);
      }
      if (bp.progress !== undefined) {
        const unit = entry.progress?.unit ?? bp.progress.unit;
        entry.progress = {
          done: (entry.progress?.done ?? 0) + bp.progress.done,
          total: (entry.progress?.total ?? 0) + bp.progress.total,
          ...(unit !== undefined ? { unit } : {}),
        };
      }
      map.set(bp.id, entry);
    }
  }
  const result = Array.from(map.values());
  // No grade while estimating (US-001 S8).
  for (const entry of result) {
    if (entry.progress !== undefined) {
      entry.compliance = undefined;
      entry.pageIndicators = entry.pageIndicators.map(() => undefined);
      continue;
    }
    const journey = journeyIndicator(indicators.get(entry.id) ?? []);
    if (journey !== undefined) entry.indicator = journey;
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
    pageIndicators: [],
    offenders: [],
    lines: [],
    error: bp.error,
  };
}

/** Pairs each persisted offender string with its image finding when the line still matches it. */
function buildLines(page: PageAnalysis, bp: BestPractice, resolve: PreviewResolver): BestPracticeLine[] {
  const offenders = bp.offenders ?? [];
  if (bp.images === undefined) return offenders.map((text, index) => fileOrTextLine(bp, text, index, resolve));
  const findings = lineFindings(bp.images);
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

/** ARCH-DECISION-017: a line is a file line only if it still starts with `prefix + fileLabel(url)`. */
function fileOrTextLine(
  bp: BestPractice,
  text: string,
  index: number,
  resolve: PreviewResolver
): BestPracticeLine {
  const ref = bp.lineRefs?.[index];
  if (ref === undefined || ref === null) return { kind: "text", text };
  const prefix = ref.prefix ?? "";
  const start = `${prefix}${fileLabel(ref.url)}`;
  if (!text.startsWith(start)) return { kind: "text", text };
  const line: BestPracticeLine = {
    kind: "file",
    text,
    prefix,
    ruleId: bp.id,
    url: ref.url,
    name: displayImageName(ref.url),
    rest: text.slice(start.length),
  };
  const preview = resolve(bp.id, ref, text);
  if (preview !== undefined) line.preview = preview;
  return line;
}

type PreviewResolver = ReturnType<typeof createPreviewSubjectResolver>;

/** One resolver per page, built on the first file line only (its request index is lazy too). */
function lazyResolver(page: PageAnalysis): PreviewResolver {
  let resolver: PreviewResolver | undefined;
  return (ruleId, ref, text) => {
    resolver ??= createPreviewSubjectResolver(page.requests ?? []);
    return resolver(ruleId, ref, text);
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
