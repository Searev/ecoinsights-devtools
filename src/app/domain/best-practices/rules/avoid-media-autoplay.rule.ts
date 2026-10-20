import { LinePreview, PreviewBox } from "../../models/best-practice";
import { BestPracticeRule, RuleResult } from "../rule";
import { MAX_OFFENDER_LINES } from "../../image-estimation/policy";
import { capLines, fileLine, plural, RuleLine } from "./rule-lines";

/** Facts about one `<video>` or `<audio>` (US-014). */
export interface AutoplayMedia {
  kind: "video" | "audio";
  /** Absolute URL (currentSrc, src or first source); null when there is none. */
  url: string | null;
  /** The `autoplay` attribute is present, whatever its value. */
  autoplay: boolean;
  /** Raw `preload` attribute; null when absent. */
  preload: string | null;
  /** CSS box of a video, rounded (EPIC-PV). Never set for audio. */
  box?: PreviewBox;
}

export type AvoidMediaAutoplayPage = { media: AutoplayMedia[] };

function reasons(m: AutoplayMedia): string[] {
  const out: string[] = [];
  if (m.autoplay) out.push("lecture automatique");
  const preload = m.preload === null ? null : m.preload.trim().toLowerCase();
  if (preload === "" || preload === "auto") out.push('préchargement complet (preload="auto")');
  return out;
}

function previewOf(m: AutoplayMedia): LinePreview {
  if (m.kind === "audio") return { kind: "audio" };
  return m.box === undefined ? { kind: "video" } : { kind: "video", display: m.box };
}

export const avoidMediaAutoplayRule: BestPracticeRule<AvoidMediaAutoplayPage> = {
  id: "AvoidMediaAutoplay",
  name: "Éviter la lecture et le chargement automatique des vidéos et des sons",
  category: "content",
  collect: () => {
    const media: Array<{
      kind: "video" | "audio";
      url: string | null;
      autoplay: boolean;
      preload: string | null;
      box?: { width: number; height: number };
    }> = [];
    const nodes = document.querySelectorAll("video, audio");
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i] as any;
      let url: string = node.currentSrc || node.src || "";
      if (!url) {
        const source = node.querySelector("source[src]");
        if (source) url = source.src || "";
      }
      const isAudio = node.tagName.toLowerCase() === "audio";
      const item: (typeof media)[number] = {
        kind: isAudio ? "audio" : "video",
        url: url ? url : null,
        autoplay: node.hasAttribute("autoplay"),
        preload: node.getAttribute("preload"),
      };
      if (!isAudio) {
        const rect = node.getBoundingClientRect();
        item.box = { width: Math.round(rect.width), height: Math.round(rect.height) };
      }
      media.push(item);
    }
    return { media };
  },
  evaluate: ({ page }): RuleResult => {
    if (page === undefined) return { detail: "La page n'a pas pu être inspectée" };
    const offenders = page.media
      .map((m) => ({ m, why: reasons(m) }))
      .filter((o) => o.why.length > 0)
      .sort((a, b) => (a.m.url ?? "").localeCompare(b.m.url ?? ""));
    if (offenders.length === 0) {
      return {
        compliance: "A",
        detail: "Aucune vidéo ni aucun son lancé ou préchargé automatiquement",
      };
    }
    const n = offenders.length;
    const lines: RuleLine[] = offenders.map(({ m, why }, i) => {
      if (i >= MAX_OFFENDER_LINES) return { text: "" }; // beyond the cap: never displayed
      const prefix = m.kind === "video" ? "Vidéo " : "Son ";
      const rest = ` : ${why.join(" et ")}`;
      if (m.url === null) return { text: `${prefix}(sans source)${rest}` };
      return fileLine(m.url, rest, prefix, previewOf(m));
    });
    return {
      compliance: n === 1 ? "B" : "C",
      detail: `${n} ${plural(n, "vidéo ou son lancé", "vidéos ou sons lancés")} ou ${plural(n, "préchargé", "préchargés")} automatiquement`,
      ...capLines(lines),
    };
  },
};
