import { BestPracticeRule } from "../rule";
import { NetworkRequest } from "../../models/network-request";
import { formatKo } from "./image-rule-helpers";
import { isSuccess2xx, lastRequestPerUrl, textFileType } from "./request-helpers";
import { capLines, fileLine, formatCount, plural } from "./rule-lines";

/** A 304 is served from the cache: decoded size first. Otherwise transferred size, else decoded (US-013). */
function cssWeight(request: NetworkRequest): number {
  if (request.code === 304) return request.responseSize > 0 ? request.responseSize : request.transferSize;
  return request.transferSize > 0 ? request.transferSize : request.responseSize;
}

/** US-026: grades the number of distinct CSS files (B for 0-2, A for 3-10, C for 11+). */
export const limitCssFilesRule: BestPracticeRule<never> = {
  id: "LimitCssFiles",
  name: "Limiter le nombre de fichiers CSS",
  category: "css",
  evaluate: ({ requests }) => {
    const files = [
      ...lastRequestPerUrl(requests, (r) => (isSuccess2xx(r) || r.code === 304) && textFileType(r) === "CSS").values(),
    ]
      .map((r) => ({ url: r.url.href, weight: cssWeight(r) }))
      .sort((a, b) => b.weight - a.weight || a.url.localeCompare(b.url));
    const n = files.length;
    const indicator = { kind: "count", offenders: n, unit: "css-files" } as const;
    const lines = () => capLines(files.map((f) => fileLine(f.url, ` : ${formatKo(f.weight)}`)));

    if (n === 0) {
      return {
        compliance: "B",
        detail: "Aucun fichier CSS : vérifier que les styles ne sont pas intégrés à la page",
        indicator,
      };
    }
    if (n <= 2) {
      return {
        compliance: "B",
        detail: `${n} ${plural(n, "fichier", "fichiers")} CSS : vérifier que les styles ne sont pas regroupés dans un fichier trop volumineux ou intégrés à la page`,
        ...lines(),
        indicator,
      };
    }
    if (n <= 10) return { compliance: "A", detail: `${n} fichiers CSS`, indicator };
    return {
      compliance: "C",
      detail: `${formatCount(n)} fichiers CSS : à regrouper (10 au plus recommandés)`,
      ...lines(),
      indicator,
    };
  },
};
