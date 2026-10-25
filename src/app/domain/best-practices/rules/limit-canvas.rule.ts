import { BestPracticeRule, RuleResult } from "../rule";
import { capLines, formatCount, plural, RuleLine } from "./rule-lines";

/** One `<canvas>` attached to the top-frame document (US-027). */
export interface CanvasInfo {
  id: string | null;
  /** CSS box at collection time, rounded. 0 × 0 means not displayed. */
  width: number;
  height: number;
}

export type LimitCanvasPage = { canvases: CanvasInfo[] };

function lineText(c: CanvasInfo): string {
  const tag = c.id ? `<canvas id="${c.id}">` : "<canvas>";
  if (c.width === 0 && c.height === 0) return `${tag} : non affiché`;
  return `${tag} : ${formatCount(c.width)} × ${formatCount(c.height)} px`;
}

export const limitCanvasRule: BestPracticeRule<LimitCanvasPage> = {
  id: "LimitCanvas",
  name: "Limiter l'utilisation des éléments canvas",
  category: "content",
  collect: () => {
    const canvases: Array<{ id: string | null; width: number; height: number }> = [];
    const nodes = document.querySelectorAll("canvas");
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const rect = node.getBoundingClientRect();
      const id = (node.getAttribute("id") || "").trim();
      canvases.push({
        id: id === "" ? null : id,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }
    return { canvases };
  },
  evaluate: ({ page }): RuleResult => {
    if (page === undefined) return { detail: "La page n'a pas pu être inspectée" };
    const n = page.canvases.length;
    if (n === 0) return { compliance: "A", detail: "Aucun élément canvas sur la page" };
    // Displayed first (area descending), then non-displayed (0 × 0); Array.sort is stable.
    const shown = (c: CanvasInfo) => !(c.width === 0 && c.height === 0);
    const sorted = page.canvases.slice().sort((a, b) => {
      const sa = shown(a);
      const sb = shown(b);
      if (sa !== sb) return sa ? -1 : 1;
      return sa ? b.width * b.height - a.width * a.height : 0;
    });
    const lines: RuleLine[] = sorted.map((c) => ({ text: lineText(c) }));
    return {
      compliance: "B",
      detail: `${formatCount(n)} ${plural(n, "élément", "éléments")} canvas : vérifier s'ils peuvent être remplacés par des éléments HTML`,
      ...capLines(lines),
    };
  },
};
