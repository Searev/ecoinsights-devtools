import { BestPractice } from "../models/best-practice";
import {
  EstimateLookup,
  EstimationJob,
  UNAVAILABLE_ESTIMATES,
  estimationKey,
} from "../models/image-estimation";
import { NetworkRequest } from "../models/network-request";
import {
  ContentJob,
  ContentLookup,
  UNAVAILABLE_CONTENTS,
  contentKey,
} from "../models/text-content";
import { BestPracticeRule, CollectOutcome } from "./rule";

export interface EvaluationInput {
  url: string;
  requests: readonly NetworkRequest[];
  /** Collector outcomes keyed by rule id. */
  pageData: Record<string, CollectOutcome>;
  /** Estimation cache view (ARCH-DECISION-007). Default: every estimation is unavailable. */
  estimates?: EstimateLookup;
  /** Content-analysis cache view (ARCH-DECISION-018). Default: every file is not evaluated. */
  contents?: ContentLookup;
}

function pageOf(rule: BestPracticeRule<any>, input: Pick<EvaluationInput, "pageData">) {
  const outcome = input.pageData[rule.id];
  return outcome && outcome.ok ? outcome.data : undefined;
}

/** Evaluates every rule, in registry order. Pure; a throwing rule never affects the others. */
export function evaluateRules(
  rules: readonly BestPracticeRule<any>[],
  input: EvaluationInput
): BestPractice[] {
  return rules.map((rule) => {
    const page = pageOf(rule, input);
    const base = { id: rule.id, name: rule.name, category: rule.category };
    try {
      const res = rule.evaluate({
        url: input.url,
        requests: input.requests,
        page,
        estimates: input.estimates ?? UNAVAILABLE_ESTIMATES,
        contents: input.contents ?? UNAVAILABLE_CONTENTS,
      });
      const evaluated: BestPractice = {
        ...base,
        compliance: res.compliance,
        detail: res.detail,
        offenders: res.offenders,
        progress: res.progress,
        images: res.images,
        lineRefs: res.lineRefs,
      };
      // US-029: an indicator never outlives a missing grade (pending, "Non évaluée").
      if (res.compliance !== undefined && res.indicator !== undefined) evaluated.indicator = res.indicator;
      return evaluated;
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

/** Estimation jobs of every rule, deduplicated by `estimationKey`. A throwing rule is ignored. */
export function planEstimations(
  rules: readonly BestPracticeRule<any>[],
  input: Omit<EvaluationInput, "estimates" | "contents">
): EstimationJob[] {
  const jobs = new Map<string, EstimationJob>();
  for (const rule of rules) {
    if (typeof rule.estimations !== "function") continue;
    try {
      const planned = rule.estimations({
        url: input.url,
        requests: input.requests,
        page: pageOf(rule, input),
      });
      for (const job of planned) {
        const key = estimationKey(job);
        if (!jobs.has(key)) jobs.set(key, job);
      }
    } catch {
      // A broken rule must not prevent the others from being estimated.
    }
  }
  return [...jobs.values()];
}

/** Content analysis jobs of every rule, deduplicated by `contentKey`. A throwing rule is ignored. */
export function planContentAnalyses(
  rules: readonly BestPracticeRule<any>[],
  input: Omit<EvaluationInput, "estimates" | "contents">
): ContentJob[] {
  const jobs = new Map<string, ContentJob>();
  for (const rule of rules) {
    if (typeof rule.contentAnalyses !== "function") continue;
    try {
      const planned = rule.contentAnalyses({
        url: input.url,
        requests: input.requests,
        page: pageOf(rule, input),
      });
      for (const job of planned) {
        const key = contentKey(job);
        if (!jobs.has(key)) jobs.set(key, job);
      }
    } catch {
      // A broken rule must not prevent the others from being analysed.
    }
  }
  return [...jobs.values()];
}
