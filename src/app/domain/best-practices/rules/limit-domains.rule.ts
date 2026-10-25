import { BestPracticeRule } from "../rule";
import { formatKo } from "./image-rule-helpers";
import { hostOf } from "./request-helpers";
import { capLines, plural, RuleLine } from "./rule-lines";

/** US-011: A below this many domains, B at exactly this many, C above. */
const DOMAIN_LIMIT = 5;

export const limitDomainsRule: BestPracticeRule<never> = {
  id: "LimitDomains",
  name: "Limiter le nombre de domaines servant les ressources",
  category: "network",
  evaluate: ({ requests }) => {
    const byHost = new Map<string, { count: number; bytes: number }>();
    for (const request of requests) {
      const host = hostOf(request.url);
      const entry = byHost.get(host);
      if (entry) {
        entry.count += 1;
        entry.bytes += request.transferSize;
      } else {
        byHost.set(host, { count: 1, bytes: request.transferSize });
      }
    }
    const n = byHost.size;
    if (n === 0) {
      return {
        compliance: "A",
        detail: "Aucune ressource chargée par la page",
        indicator: { kind: "count", offenders: 0, unit: "domains" },
      };
    }
    const lines: RuleLine[] = [...byHost]
      .sort(
        ([hostA, a], [hostB, b]) =>
          b.count - a.count || b.bytes - a.bytes || hostA.localeCompare(hostB)
      )
      .map(([host, { count, bytes }]) => ({
        text: `${host} : ${count} ${plural(count, "requête", "requêtes")}, ${formatKo(bytes)}`,
      }));
    return {
      compliance: n < DOMAIN_LIMIT ? "A" : n === DOMAIN_LIMIT ? "B" : "C",
      detail: `${n} ${plural(n, "domaine sert", "domaines servent")} les ressources de la page`,
      ...capLines(lines),
      indicator: { kind: "count", offenders: n, unit: "domains" },
    };
  },
};
