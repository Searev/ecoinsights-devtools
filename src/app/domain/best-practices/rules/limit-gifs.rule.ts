import { BestPracticeRule } from "../rule";
import { normaliseImageUrl } from "../../image-estimation/image-requests";
import { PreviewBox } from "../../models/best-practice";
import { NetworkRequest } from "../../models/network-request";
import { formatKo } from "./image-rule-helpers";
import { isGenericMime, isSuccess2xx, lastRequestPerUrl, pathExtension } from "./request-helpers";
import { capLines, fileLine, plural, RuleLine } from "./rule-lines";

function isGif(request: NetworkRequest): boolean {
  const type = request.type.toLowerCase();
  return type === "image/gif" || (isGenericMime(type) && pathExtension(request.url) === "gif");
}

/** Transferred size, or the decoded size when served from the cache, so every page shows the same weight. */
function gifSize(request: NetworkRequest): number {
  return request.transferSize > 0 ? request.transferSize : request.responseSize;
}

/** An `<img>` of the page and its CSS box (ARCH-DECISION-020), deduplicated by URL. */
export type LimitGifsPage = { images: Array<{ url: string; width: number; height: number }> };

/** US-013: every distinct GIF requested by the page counts, animated or not. */
export const limitGifsRule: BestPracticeRule<LimitGifsPage> = {
  id: "LimitGifs",
  name: "Limiter l'utilisation des GIFs animés",
  category: "images",
  collect: () => {
    const images: Array<{ url: string; width: number; height: number }> = [];
    const indexByUrl: { [url: string]: number } = {};
    const nodes = document.querySelectorAll("img");
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i] as any;
      const url: string = node.currentSrc || node.src || "";
      if (url === "" || url.slice(0, 5).toLowerCase() === "data:") continue;
      const rect = node.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      const known = indexByUrl[url];
      if (known === undefined) {
        indexByUrl[url] = images.length;
        images.push({ url, width, height });
      } else if (width * height > images[known].width * images[known].height) {
        images[known] = { url, width, height };
      }
    }
    return { images };
  },
  evaluate: ({ requests, page }) => {
    // Largest box per normalised URL (fragment ignored); the collector already keeps the largest per exact URL.
    let boxes: Map<string, PreviewBox> | undefined;
    if (page !== undefined) {
      boxes = new Map();
      for (const image of page.images) {
        const key = normaliseImageUrl(image.url);
        const known = boxes.get(key);
        if (known === undefined || image.width * image.height > known.width * known.height) {
          boxes.set(key, { width: image.width, height: image.height });
        }
      }
    }
    const gifs = [...lastRequestPerUrl(requests, (r) => isSuccess2xx(r) && isGif(r)).values()]
      .map((r) => ({ url: r.url.href, size: gifSize(r) }))
      .sort((a, b) => b.size - a.size || a.url.localeCompare(b.url));
    if (gifs.length === 0) return { compliance: "A", detail: "Aucun fichier GIF" };
    const lines: RuleLine[] = gifs.map((g) =>
      fileLine(
        g.url,
        ` : ${formatKo(g.size)}`,
        "",
        boxes === undefined
          ? { kind: "image" }
          : { kind: "image", display: boxes.get(normaliseImageUrl(g.url)) ?? { width: 0, height: 0 } }
      )
    );
    return {
      compliance: gifs.length === 1 ? "B" : "C",
      detail: `${gifs.length} ${plural(gifs.length, "fichier", "fichiers")} GIF : à remplacer par une vidéo WebM ou MP4 pour les animations, ou un format d'image moderne`,
      ...capLines(lines),
    };
  },
};
