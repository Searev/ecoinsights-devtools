import { describe, expect, it } from "vitest";
import {
  aggregateBestPractices,
  describeProgress,
  groupByCategory,
  worstCompliance,
} from "./best-practices-view";
import { PageAnalysis } from "../../domain/models/page-analysis";
import { BestPractice } from "../../domain/models/best-practice";

const page = (title: string, bps: BestPractice[]) =>
  ({ title, bestPractices: bps } as unknown as PageAnalysis);

describe("worstCompliance", () => {
  it("picks the worst defined grade and never lets undefined win", () => {
    expect(worstCompliance("A", "C")).toBe("C");
    expect(worstCompliance("C", "B")).toBe("C");
    expect(worstCompliance(undefined, "A")).toBe("A");
    expect(worstCompliance("B", undefined)).toBe("B");
    expect(worstCompliance(undefined, undefined)).toBeUndefined();
  });
});

describe("aggregateBestPractices", () => {
  it("aggregates across pages with the worst defined grade and merged offenders", () => {
    const base = { id: "r", name: "R", category: "images" as const };
    const result = aggregateBestPractices([
      page("P1", [{ ...base, compliance: "A", detail: "ok" }]),
      page("P2", [{ ...base, compliance: undefined, detail: "?", error: "x" }]),
      page("P3", [{ ...base, compliance: "C", detail: "bad", offenders: ["u1"] }]),
      page("P4", [{ ...base, compliance: "B", detail: "meh", offenders: ["u1", "u2"] }]),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].compliance).toBe("C");
    expect(result[0].detail).toBe("bad");
    expect(result[0].offenders).toEqual(["u1", "u2"]);
    expect(result[0].pages).toEqual(["P2", "P3", "P4"]);
  });

  it("keeps compliance undefined when no page could evaluate the rule", () => {
    const base = { id: "r", name: "R", category: "css" as const, detail: "?" };
    const result = aggregateBestPractices([page("P1", [base]), page("P2", [base])]);
    expect(result[0].compliance).toBeUndefined();
  });
});

describe("groupByCategory", () => {
  it("groups in a stable order and skips empty categories", () => {
    const mk = (id: string, category: any) => ({
      id, name: id, category, detail: "", pages: [], offenders: [],
    });
    const groups = groupByCategory([mk("a", "js"), mk("b", "content"), mk("c", "js")]);
    expect(groups.map((g) => g.category)).toEqual(["content", "js"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["a", "c"]);
  });
});

describe("estimation progress aggregation", () => {
  const base = { id: "r", name: "R", category: "images" as const, detail: "d" };

  it("sums progress across pages and drops the grade while estimating", () => {
    const result = aggregateBestPractices([
      page("P1", [{ ...base, compliance: "C", offenders: ["u1"] }]),
      page("P2", [{ ...base, compliance: undefined, progress: { done: 2, total: 5 } }]),
      page("P3", [{ ...base, compliance: undefined, progress: { done: 1, total: 3 } }]),
    ]);
    expect(result[0].progress).toEqual({ done: 3, total: 8 });
    expect(result[0].compliance).toBeUndefined();
  });

  it("has no progress when no page is estimating", () => {
    const result = aggregateBestPractices([page("P1", [{ ...base, compliance: "B" }])]);
    expect(result[0].progress).toBeUndefined();
    expect(result[0].compliance).toBe("B");
  });

  it("describes the progress in French", () => {
    expect(describeProgress({ done: 2, total: 5 })).toBe("Estimation en cours… (2/5 images)");
  });
});
