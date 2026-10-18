import { describe, expect, it } from "vitest";
import {
  aggregateBestPractices,
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
