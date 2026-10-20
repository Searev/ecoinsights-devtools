import { LinePreview } from "../../models/best-practice";
import { BestPracticeRule, RuleResult } from "../rule";
import { MAX_OFFENDER_LINES } from "../../image-estimation/policy";
import { capLines, fileLine, formatCount, plural } from "./rule-lines";

/** Facts about one `<img>` or `<iframe>` (US-007). Classified in `evaluate`. */
export interface LazyElement {
  kind: "img" | "iframe";
  url: string;
  /** Top edge in document coordinates, rounded. */
  top: number;
  /** False for a 0 x 0 box (display:none included). */
  rendered: boolean;
  /** Raw `loading` attribute; null when absent. */
  loading: string | null;
  /** `data-src` / `data-srcset` with a not-yet-loaded `src` (lazy-loading libraries). */
  scriptLazy: boolean;
  dataUri: boolean;
  trackingPixel: boolean;
  /** Rounded CSS box size (EPIC-PV). Absent in older analyses. */
  width?: number;
  height?: number;
}

export type UseLazyLoadingPage = { viewportHeight: number; elements: LazyElement[] };

const HTTP_URL = /^https?:\/\//i;

function previewOf(e: LazyElement): LinePreview {
  if (e.kind === "iframe") return { kind: "iframe", top: e.top };
  if (e.width === undefined || e.height === undefined) return { kind: "image" };
  return { kind: "image", display: { width: e.width, height: e.height } };
}

export const useLazyLoadingRule: BestPracticeRule<UseLazyLoadingPage> = {
  id: "UseLazyLoading",
  name: "Utiliser le chargement paresseux",
  category: "images",
  collect: () => {
    const elements: Array<{
      kind: "img" | "iframe";
      url: string;
      top: number;
      rendered: boolean;
      loading: string | null;
      scriptLazy: boolean;
      dataUri: boolean;
      trackingPixel: boolean;
      width: number;
      height: number;
    }> = [];
    const scrollY = window.scrollY || 0;
    const nodes = document.querySelectorAll("img, iframe");
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i] as any;
      const isImg = node.tagName.toLowerCase() === "img";
      const rect = node.getBoundingClientRect();
      const url: string = isImg ? node.currentSrc || node.src || "" : node.src || "";
      let scriptLazy = false;
      let trackingPixel = false;
      if (isImg) {
        const srcAttr = node.getAttribute("src");
        if (node.hasAttribute("data-src") || node.hasAttribute("data-srcset")) {
          scriptLazy =
            srcAttr === null ||
            srcAttr.trim() === "" ||
            srcAttr.trim().toLowerCase().indexOf("data:") === 0 ||
            (node.complete === true && node.naturalWidth === 0);
        }
        const w = node.getAttribute("width");
        const h = node.getAttribute("height");
        const attrPixel =
          w !== null && h !== null && w.trim() !== "" && h.trim() !== "" && parseFloat(w) <= 1 && parseFloat(h) <= 1;
        const naturalPixel =
          node.complete === true && node.naturalWidth > 0 && node.naturalWidth <= 1 && node.naturalHeight <= 1;
        trackingPixel = attrPixel || naturalPixel;
      }
      elements.push({
        kind: isImg ? "img" : "iframe",
        url,
        top: Math.round(rect.top + scrollY),
        rendered: rect.width > 0 || rect.height > 0,
        loading: node.getAttribute("loading"),
        scriptLazy,
        dataUri: url.slice(0, 5).toLowerCase() === "data:",
        trackingPixel,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }
    return { viewportHeight: window.innerHeight, elements };
  },
  evaluate: ({ page }): RuleResult => {
    if (page === undefined) return { detail: "La page n'a pas pu être inspectée" };
    const offenders = page.elements
      .filter(
        (e) =>
          e.top >= page.viewportHeight &&
          e.rendered &&
          !e.dataUri &&
          !e.trackingPixel &&
          HTTP_URL.test(e.url) &&
          !e.scriptLazy &&
          (e.loading ?? "").trim().toLowerCase() !== "lazy"
      )
      .sort((a, b) => a.top - b.top || a.url.localeCompare(b.url));
    if (offenders.length === 0) {
      return {
        compliance: "A",
        detail: "Aucune image ni iframe hors de l'écran initial chargée immédiatement",
      };
    }
    const n = offenders.length;
    // Only the lines that survive the cap are built (URL parsing is the costly part).
    const lines = offenders.map((e, i) =>
      i >= MAX_OFFENDER_LINES
        ? { text: "" }
        : fileLine(
            e.url,
            ` : chargée immédiatement (située à ${formatCount(e.top)} px du haut de page)`,
            e.kind === "iframe" ? "Iframe " : "",
            previewOf(e)
          )
    );
    return {
      compliance: n === 1 ? "B" : "C",
      detail: `${n} ${plural(n, "image ou iframe hors de l'écran initial chargée", "images ou iframes hors de l'écran initial chargées")} immédiatement`,
      ...capLines(lines),
    };
  },
};
