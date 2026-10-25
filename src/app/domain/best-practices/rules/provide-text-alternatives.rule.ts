import { PreviewBox } from "../../models/best-practice";
import { BestPracticeRule, RuleResult } from "../rule";
import { MAX_OFFENDER_LINES } from "../../image-estimation/policy";
import { capLines, fileLine, plural, RuleLine } from "./rule-lines";

/** Facts about one element that may need a textual alternative (US-006). Classified in `evaluate`. */
export interface AlternativeElement {
  kind: "img" | "input" | "area" | "video";
  /** Absolute URL; null when the element has none. */
  url: string | null;
  /** role presentation / none, or aria-hidden="true". */
  decorative: boolean;
  trackingPixel: boolean;
  /** Raw `alt` attribute; null when absent. */
  alt: string | null;
  ariaLabel: string | null;
  /** Trimmed text of the elements named by `aria-labelledby`; null when the attribute is absent. */
  labelledByText: string | null;
  title: string | null;
  hasCaptions: boolean;
  /** CSS box, rounded (EPIC-PV). Set for img, input and video; never for area. */
  box?: PreviewBox;
}

export type ProvideTextAlternativesPage = { elements: AlternativeElement[] };

const NO_SOURCE = "(sans source)";
const MISSING_IMAGE = " : alternative absente";
const EMPTY_IMAGE = " : alternative vide (à vérifier si l'image n'est pas décorative)";
const MISSING_VIDEO = " : ni sous-titres ni libellé";

type Verdict = "ok" | "missing" | "empty";

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === "";
}

function classify(e: AlternativeElement): Verdict {
  if (e.decorative) return "ok";
  if (e.kind !== "video" && e.trackingPixel) return "ok";
  if (!isBlank(e.ariaLabel) || !isBlank(e.labelledByText)) return "ok";
  if (e.kind === "video") {
    return e.hasCaptions || !isBlank(e.title) ? "ok" : "missing";
  }
  if (e.alt === null) return "missing";
  return e.alt.trim() === "" ? "empty" : "ok";
}

function buildLine(e: AlternativeElement, verdict: Verdict): RuleLine {
  const rest =
    e.kind === "video" ? MISSING_VIDEO : verdict === "missing" ? MISSING_IMAGE : EMPTY_IMAGE;
  const prefix = e.kind === "video" ? "Vidéo " : "";
  if (e.url === null || e.url === "") return { text: `${prefix}${NO_SOURCE}${rest}` };
  if (e.kind === "area") return fileLine(e.url, rest);
  const display = e.box === undefined ? {} : { display: e.box };
  return fileLine(e.url, rest, prefix, { kind: e.kind === "video" ? "video" : "image", ...display });
}

function byUrl(a: { url: string | null }, b: { url: string | null }): number {
  return (a.url ?? "").localeCompare(b.url ?? "");
}

export const provideTextAlternativesRule: BestPracticeRule<ProvideTextAlternativesPage> = {
  id: "ProvideTextAlternatives",
  name: "Fournir une alternative textuelle aux contenus multimédias",
  category: "content",
  collect: () => {
    const elements: Array<{
      kind: "img" | "input" | "area" | "video";
      url: string | null;
      decorative: boolean;
      trackingPixel: boolean;
      alt: string | null;
      ariaLabel: string | null;
      labelledByText: string | null;
      title: string | null;
      hasCaptions: boolean;
      box?: { width: number; height: number };
    }> = [];
    const nodes = document.querySelectorAll("img, input[type=image i], area[href], video");
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i] as any;
      const tag = node.tagName.toLowerCase();
      const kind = tag === "img" || tag === "area" || tag === "video" ? tag : "input";

      const role = (node.getAttribute("role") || "").trim().toLowerCase().split(/\s+/)[0];
      const decorative =
        role === "presentation" || role === "none" || node.getAttribute("aria-hidden") === "true";

      let url = "";
      let trackingPixel = false;
      let hasCaptions = false;
      if (kind === "img") {
        url = node.currentSrc || node.src;
        const w = node.getAttribute("width");
        const h = node.getAttribute("height");
        const attrPixel =
          w !== null && h !== null && w.trim() !== "" && h.trim() !== "" && parseFloat(w) <= 1 && parseFloat(h) <= 1;
        const naturalPixel =
          node.complete === true && node.naturalWidth > 0 && node.naturalWidth <= 1 && node.naturalHeight <= 1;
        trackingPixel = attrPixel || naturalPixel;
      } else if (kind === "area") {
        url = node.href;
      } else if (kind === "input") {
        url = node.src;
      } else {
        url = node.currentSrc || node.src;
        if (!url) {
          const source = node.querySelector("source[src]");
          if (source) url = source.src;
        }
        const children = node.children;
        for (let c = 0; c < children.length; c++) {
          if (children[c].tagName.toLowerCase() !== "track") continue;
          const trackKind = (children[c].getAttribute("kind") || "").trim().toLowerCase();
          if (trackKind === "" || trackKind === "captions" || trackKind === "subtitles") hasCaptions = true;
        }
      }

      let labelledByText: string | null = null;
      const labelledBy = node.getAttribute("aria-labelledby");
      if (labelledBy !== null) {
        const ids = labelledBy.split(/\s+/);
        const texts: string[] = [];
        for (let k = 0; k < ids.length; k++) {
          if (ids[k] === "") continue;
          const target = document.getElementById(ids[k]);
          const text = target ? (target.textContent || "").trim() : "";
          if (text !== "") texts.push(text);
        }
        labelledByText = texts.join(" ");
      }

      let box: { width: number; height: number } | undefined;
      if (kind !== "area") {
        const rect = node.getBoundingClientRect();
        box = { width: Math.round(rect.width), height: Math.round(rect.height) };
      }

      const element: (typeof elements)[number] = {
        kind,
        url: url ? url : null,
        decorative,
        trackingPixel,
        alt: node.getAttribute("alt"),
        ariaLabel: node.getAttribute("aria-label"),
        labelledByText,
        title: node.getAttribute("title"),
        hasCaptions,
      };
      if (box !== undefined) element.box = box;
      elements.push(element);
    }
    return { elements };
  },
  evaluate: ({ page }): RuleResult => {
    if (page === undefined) return { detail: "La page n'a pas pu être inspectée" };
    const missing: AlternativeElement[] = [];
    const empty: AlternativeElement[] = [];
    for (const e of page.elements) {
      const verdict = classify(e);
      if (verdict === "missing") missing.push(e);
      else if (verdict === "empty") empty.push(e);
    }
    if (missing.length === 0 && empty.length === 0) {
      return {
        compliance: "A",
        detail: "Aucun contenu multimédia sans alternative textuelle",
        indicator: { kind: "ratio", offenders: 0, expected: page.elements.length, unit: "missing-alternatives" },
      };
    }
    // Array.prototype.sort is stable: equal URLs keep their document order.
    const sorted = [
      ...[...missing].sort(byUrl).map((e) => ({ e, verdict: "missing" as Verdict })),
      ...[...empty].sort(byUrl).map((e) => ({ e, verdict: "empty" as Verdict })),
    ];
    // Only the lines that survive the cap are built (URL parsing is the costly part).
    const lines: RuleLine[] = sorted.map(({ e, verdict }, i) =>
      i >= MAX_OFFENDER_LINES ? { text: "" } : buildLine(e, verdict)
    );
    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(
        `${missing.length} ${plural(missing.length, "contenu multimédia", "contenus multimédias")} sans alternative textuelle`
      );
    }
    if (empty.length > 0) {
      parts.push(
        `${empty.length} ${plural(empty.length, "alternative vide", "alternatives vides")} à vérifier`
      );
    }
    return {
      compliance: missing.length > 0 ? "C" : "B",
      detail: parts.join(", "),
      ...capLines(lines),
      indicator: {
        kind: "ratio",
        offenders: missing.length + empty.length,
        expected: page.elements.length,
        unit: "missing-alternatives",
      },
    };
  },
};
