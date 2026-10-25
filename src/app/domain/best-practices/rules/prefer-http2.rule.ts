import { HttpVersion } from "../../models/network-request";
import { BestPracticeRule } from "../rule";
import { hostOf, isSuccess2xx } from "./request-helpers";
import { capLines, plural, RuleLine } from "./rule-lines";

/** US-012: C from this share of HTTP/1.x requests (1 in 10), compared with integers. */
const C_SHARE_DENOMINATOR = 10;

export const preferHttp2Rule: BestPracticeRule<never> = {
  id: "PreferHttp2",
  name: "Privilégier HTTP/2 à HTTP/1",
  category: "network",
  evaluate: ({ requests }) => {
    let network = 0;
    let counted = 0;
    let legacy = 0;
    const byHost = new Map<string, { total: number; v10: number; v11: number }>();
    for (const request of requests) {
      const version: HttpVersion | undefined = request.httpVersion;
      // Served from the browser cache: no network transfer, version unreliable (scenario 6).
      if (isSuccess2xx(request) && request.transferSize === 0) continue;
      network += 1;
      if (version === undefined) continue;
      counted += 1;
      if (version !== "1.0" && version !== "1.1") continue;
      legacy += 1;
      const host = hostOf(request.url);
      let entry = byHost.get(host);
      if (!entry) byHost.set(host, (entry = { total: 0, v10: 0, v11: 0 }));
      entry.total += 1;
      if (version === "1.0") entry.v10 += 1;
      else entry.v11 += 1;
    }

    if (network === 0) {
      return {
        compliance: "A",
        detail: "Aucune requête réseau à vérifier",
        indicator: { kind: "ratio", offenders: 0, expected: 0, unit: "http1-requests" },
      };
    }
    if (counted === 0) {
      return { detail: "Version HTTP inconnue pour toutes les requêtes" };
    }
    if (legacy === 0) {
      return {
        compliance: "A",
        detail: "Toutes les requêtes utilisent HTTP/2 ou HTTP/3",
        indicator: { kind: "ratio", offenders: 0, expected: counted, unit: "http1-requests" },
      };
    }
    const percent = Math.round((100 * legacy) / counted);
    const shown = percent === 0 ? "< 1" : String(percent);
    const lines: RuleLine[] = [...byHost]
      .sort(([hostA, a], [hostB, b]) => b.total - a.total || hostA.localeCompare(hostB))
      .map(([host, { total, v10, v11 }]) => ({
        text: `${host} : ${total} ${plural(total, "requête", "requêtes")} en HTTP/${v10 > v11 ? "1.0" : "1.1"}`,
      }));
    return {
      compliance: legacy * C_SHARE_DENOMINATOR >= counted ? "C" : "B",
      detail: `${shown} % des requêtes en HTTP/1 (${legacy} sur ${counted})`,
      ...capLines(lines),
      indicator: { kind: "ratio", offenders: legacy, expected: counted, unit: "http1-requests" },
    };
  },
};
