import { BestPracticeRule } from "../rule";
import { formatCount, plural } from "./rule-lines";

/** US-025: A up to this many requests, B up to `C_THRESHOLD - 1`, C from there. */
const RECOMMENDED_MAX = 40;
const C_THRESHOLD = 71;

export const limitRequestsRule: BestPracticeRule<never> = {
  id: "LimitRequests",
  name: "Limiter le nombre de requêtes HTTP",
  category: "network",
  evaluate: ({ requests }) => {
    // Every recorded request counts: same number as the "Requêtes" column.
    const n = requests.length;
    if (n <= RECOMMENDED_MAX) {
      return {
        compliance: "A",
        detail: `${formatCount(n)} ${plural(n, "requête", "requêtes")} HTTP`,
        indicator: { kind: "count", offenders: n, unit: "requests" },
      };
    }
    return {
      compliance: n < C_THRESHOLD ? "B" : "C",
      detail: `${formatCount(n)} requêtes HTTP (${RECOMMENDED_MAX} au plus recommandées)`,
      indicator: { kind: "count", offenders: n, unit: "requests" },
    };
  },
};
