import { BestPractice } from "../models/best-practice";
import { NetworkRequest } from "../models/network-request";
import { BestPracticeRule, CollectOutcome } from "./rule";

export interface EvaluationInput {
  url: string;
  requests: readonly NetworkRequest[];
  /** Collector outcomes keyed by rule id. */
  pageData: Record<string, CollectOutcome>;
}

/** Evaluates every rule, in registry order. Pure; a throwing rule never affects the others. */
export function evaluateRules(
  rules: readonly BestPracticeRule<any>[],
  input: EvaluationInput
): BestPractice[] {
  return rules.map((rule) => {
    const outcome = input.pageData[rule.id];
    const page = outcome && outcome.ok ? outcome.data : undefined;
    const base = { id: rule.id, name: rule.name, category: rule.category };
    try {
      const res = rule.evaluate({
        url: input.url,
        requests: input.requests,
        page,
      });
      return {
        ...base,
        compliance: res.compliance,
        detail: res.detail,
        offenders: res.offenders,
      };
    } catch (e) {
      return {
        ...base,
        detail: "Règle non évaluée",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
}

/** Ids of the rules that need to run a collector in the inspected page. */
export function collectableRuleIds(
  rules: readonly BestPracticeRule<any>[]
): string[] {
  return rules.filter((r) => typeof r.collect === "function").map((r) => r.id);
}
