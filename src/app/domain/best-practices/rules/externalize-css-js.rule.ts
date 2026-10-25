import { BestPracticeRule, RuleResult } from "../rule";
import { capLines, plural, RuleLine } from "./rule-lines";

/** One inline `<style>` or JavaScript `<script>` of the page (US-024). */
export interface InlineBlock {
  tag: "style" | "script";
  /** Trimmed `id` attribute; null when absent or blank. */
  id: string | null;
  /** Length of the text content, in characters. */
  size: number;
}

export type ExternalizeCssJsPage = { blocks: InlineBlock[] };

/** Size in ko with at most one decimal ("12 ko", "0,4 ko"); 1 ko = 1 000 characters. */
function formatInlineKo(chars: number): string {
  return `${(chars / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ko`;
}

export const externalizeCssJsRule: BestPracticeRule<ExternalizeCssJsPage> = {
  id: "ExternalizeCssJs",
  name: "Externaliser les CSS et JavaScript",
  category: "js",
  collect: () => {
    const blocks: Array<{ tag: "style" | "script"; id: string | null; size: number }> = [];
    const jsTypes = [
      "text/javascript",
      "application/javascript",
      "application/ecmascript",
      "text/ecmascript",
      "application/x-javascript",
    ];
    const nodes = document.querySelectorAll("style, script");
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const tag = el.localName === "script" ? "script" : "style";
      if (tag === "script") {
        if (el.hasAttribute("src")) continue;
        const raw = el.getAttribute("type");
        const type = (raw === null ? "" : raw).trim().toLowerCase().split(";")[0].trim();
        if (type !== "" && type !== "module" && jsTypes.indexOf(type) === -1) continue;
      }
      const text = el.textContent || "";
      if (text.trim() === "") continue;
      const rawId = el.getAttribute("id");
      const id = rawId === null || rawId.trim() === "" ? null : rawId.trim();
      blocks.push({ tag, id, size: text.length });
    }
    return { blocks };
  },
  evaluate: ({ page }): RuleResult => {
    if (page === undefined) return { detail: "La page n'a pas pu être inspectée" };
    const n = page.blocks.length;
    if (n === 0) return { compliance: "A", detail: "Aucun CSS ni JavaScript en ligne" };
    if (n <= 2) {
      return { compliance: "A", detail: `${n} ${plural(n, "bloc", "blocs")} CSS ou JavaScript en ligne` };
    }
    const s = page.blocks.filter((b) => b.tag === "style").length;
    const j = n - s;
    const lines: RuleLine[] = page.blocks
      .map((b, index) => ({ b, index }))
      .sort((x, y) => y.b.size - x.b.size || x.index - y.index)
      .map(({ b }) => ({
        text: `<${b.tag}${b.id ? ` id="${b.id}"` : ""}> en ligne : ${formatInlineKo(b.size)}`,
      }));
    return {
      compliance: n <= 5 ? "B" : "C",
      detail: `${n} blocs CSS ou JavaScript en ligne (${s} <style>, ${j} <script>) : à externaliser dans des fichiers mis en cache`,
      ...capLines(lines),
    };
  },
};
