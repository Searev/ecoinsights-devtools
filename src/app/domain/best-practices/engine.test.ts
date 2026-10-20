import { describe, expect, it } from "vitest";
import { EstimationJob, UNAVAILABLE_ESTIMATES } from "../models/image-estimation";
import { ContentJob, ContentLookup, UNAVAILABLE_CONTENTS } from "../models/text-content";
import { collectableRuleIds, evaluateRules, planContentAnalyses, planEstimations } from "./engine";
import { BestPracticeRule } from "./rule";

function rule(
  id: string,
  overrides: Partial<BestPracticeRule<any>> = {}
): BestPracticeRule<any> {
  return {
    id,
    name: `name-${id}`,
    category: "css",
    evaluate: ({ page }) => ({
      compliance: "A",
      detail: `page=${JSON.stringify(page)}`,
    }),
    ...overrides,
  };
}

const input = { url: "https://example.com", requests: [], pageData: {} };

describe("evaluateRules", () => {
  it("copies lineRefs (ARCH-DECISION-017)", () => {
    const lineRefs = [{ url: "https://x.test/a.js" }, null];
    const res = evaluateRules(
      [rule("a", { evaluate: () => ({ compliance: "C", detail: "d", offenders: ["a.js : x", "y"], lineRefs }) })],
      input
    );
    expect(res[0].lineRefs).toEqual(lineRefs);
  });

  it("passes the contents lookup to the rules (ARCH-DECISION-018)", () => {
    const contents: ContentLookup = () => ({ status: "analysed", characters: 10, removableCharacters: 1 });
    let seen: ContentLookup | undefined;
    evaluateRules([rule("a", { evaluate: (ctx) => ((seen = ctx.contents), { compliance: "A", detail: "" }) })], {
      ...input,
      contents,
    });
    expect(seen).toBe(contents);
  });

  it("defaults the contents lookup to UNAVAILABLE_CONTENTS", () => {
    let seen: ContentLookup | undefined;
    evaluateRules([rule("a", { evaluate: (ctx) => ((seen = ctx.contents), { compliance: "A", detail: "" }) })], input);
    expect(seen).toBe(UNAVAILABLE_CONTENTS);
  });

  it("returns one result per rule in registry order with rule metadata", () => {
    const rules = [
      rule("b", { category: "images" }),
      rule("a", { category: "fonts" }),
    ];
    const res = evaluateRules(rules, input);
    expect(res.map((r) => [r.id, r.name, r.category])).toEqual([
      ["b", "name-b", "images"],
      ["a", "name-a", "fonts"],
    ]);
  });

  it("copies compliance, detail and offenders", () => {
    const res = evaluateRules(
      [
        rule("a", {
          evaluate: () => ({ compliance: "C", detail: "d", offenders: ["x"] }),
        }),
      ],
      input
    );
    expect(res[0]).toMatchObject({
      compliance: "C",
      detail: "d",
      offenders: ["x"],
    });
    expect(res[0].error).toBeUndefined();
  });

  it("passes pageData to the matching rule only", () => {
    const rules = [rule("a", { collect: () => 1 }), rule("b", { collect: () => 2 })];
    const res = evaluateRules(rules, {
      ...input,
      pageData: {
        a: { ok: true, data: "A-data" },
        b: { ok: true, data: "B-data" },
      },
    });
    expect(res[0].detail).toBe('page="A-data"');
    expect(res[1].detail).toBe('page="B-data"');
  });

  it("gives page undefined when the outcome is ok:false or missing", () => {
    const rules = [rule("a", { collect: () => 1 }), rule("b", { collect: () => 2 })];
    const res = evaluateRules(rules, {
      ...input,
      pageData: { a: { ok: false, error: "boom" } },
    });
    expect(res[0].detail).toBe("page=undefined");
    expect(res[1].detail).toBe("page=undefined");
  });

  it("forwards url and requests to evaluate", () => {
    let seen: any;
    evaluateRules(
      [
        rule("a", {
          evaluate: (ctx) => {
            seen = ctx;
            return { compliance: "A", detail: "" };
          },
        }),
      ],
      { url: "https://u.test", requests: [], pageData: {} }
    );
    expect(seen.url).toBe("https://u.test");
    expect(seen.requests).toEqual([]);
  });

  it("isolates a throwing evaluate", () => {
    const rules = [
      rule("bad", {
        evaluate: () => {
          throw new Error("kaboom");
        },
      }),
      rule("good"),
    ];
    const res = evaluateRules(rules, input);
    expect(res[0].error).toBe("kaboom");
    expect(res[0].compliance).toBeUndefined();
    expect(res[0].detail).toBe("Règle non évaluée");
    expect(res[1].compliance).toBe("A");
    expect(res[1].error).toBeUndefined();
  });

  it("handles non-Error throws", () => {
    const res = evaluateRules(
      [
        rule("bad", {
          evaluate: () => {
            throw "oops";
          },
        }),
      ],
      input
    );
    expect(res[0].error).toBe("oops");
  });

  it("keeps no state between calls", () => {
    const rules = [rule("a", { collect: () => 1 })];
    const first = evaluateRules(rules, {
      ...input,
      pageData: { a: { ok: true, data: 1 } },
    });
    const second = evaluateRules(rules, input);
    expect(first[0].detail).toBe("page=1");
    expect(second[0].detail).toBe("page=undefined");
  });
});

describe("collectableRuleIds", () => {
  it("returns only ids of rules with a collector", () => {
    expect(
      collectableRuleIds([rule("a", { collect: () => 1 }), rule("b")])
    ).toEqual(["a"]);
  });
});

const job = (url: string, kind: "convert" | "resize" = "convert"): EstimationJob =>
  kind === "convert"
    ? { url, declaredType: "image/png", transform: { kind } }
    : { url, declaredType: "image/png", transform: { kind, width: 10, height: 10 } };

describe("evaluateRules with estimates", () => {
  it("defaults estimates to UNAVAILABLE_ESTIMATES", () => {
    let seen: any;
    evaluateRules(
      [rule("a", { evaluate: (ctx) => ((seen = ctx.estimates), { compliance: "A", detail: "" }) })],
      input
    );
    expect(seen).toBe(UNAVAILABLE_ESTIMATES);
  });

  it("passes the given estimates to evaluate", () => {
    const estimates = () => ({ status: "pending" as const });
    let seen: any;
    evaluateRules(
      [rule("a", { evaluate: (ctx) => ((seen = ctx.estimates), { compliance: "A", detail: "" }) })],
      { ...input, estimates }
    );
    expect(seen).toBe(estimates);
  });

  it("copies progress and images, and keeps an undefined compliance without error", () => {
    const images = [{ url: "u", originalBytes: 0, state: "pending" as const, offender: false, declaredType: "" }];
    const res = evaluateRules(
      [rule("a", { evaluate: () => ({ detail: "wait", progress: { done: 0, total: 1 }, images }) })],
      input
    );
    expect(res[0].compliance).toBeUndefined();
    expect(res[0].error).toBeUndefined();
    expect(res[0].progress).toEqual({ done: 0, total: 1 });
    expect(res[0].images).toEqual(images);
  });
});

describe("planEstimations", () => {
  it("collects the jobs of every rule, deduplicated by estimation key", () => {
    const rules = [
      rule("a", { estimations: () => [job("https://x.test/1.png"), job("https://x.test/2.png")] }),
      rule("b", { estimations: () => [job("https://x.test/1.png"), job("https://x.test/1.png", "resize")] }),
      rule("c"),
    ];
    const jobs = planEstimations(rules, input);
    expect(jobs.map((j) => [j.url, j.transform.kind])).toEqual([
      ["https://x.test/1.png", "convert"],
      ["https://x.test/2.png", "convert"],
      ["https://x.test/1.png", "resize"],
    ]);
  });

  it("ignores a rule whose estimations throws", () => {
    const rules = [
      rule("bad", {
        estimations: () => {
          throw new Error("x");
        },
      }),
      rule("good", { estimations: () => [job("https://x.test/1.png")] }),
    ];
    expect(planEstimations(rules, input)).toHaveLength(1);
  });

  it("resolves the page data like evaluateRules", () => {
    const seen: any[] = [];
    const rules = [
      rule("a", { estimations: (ctx) => ((seen.push(ctx.page, ctx.url)), []) }),
      rule("b", { estimations: (ctx) => ((seen.push(ctx.page)), []) }),
    ];
    planEstimations(rules, {
      ...input,
      pageData: { a: { ok: true, data: "A" }, b: { ok: false, error: "e" } },
    });
    expect(seen).toEqual(["A", "https://example.com", undefined]);
  });
});

describe("planContentAnalyses", () => {
  const contentJob = (url: string): ContentJob => ({ url, type: "JS" });

  it("collects the jobs of every rule, deduplicated by content key", () => {
    const rules = [
      rule("a", { contentAnalyses: () => [contentJob("https://x.test/1.js"), contentJob("https://x.test/2.js")] }),
      rule("b", { contentAnalyses: () => [contentJob("https://x.test/1.js#top"), contentJob("https://x.test/3.js")] }),
      rule("c"),
    ];
    expect(planContentAnalyses(rules, input).map((j) => j.url)).toEqual([
      "https://x.test/1.js",
      "https://x.test/2.js",
      "https://x.test/3.js",
    ]);
  });

  it("ignores a rule whose contentAnalyses throws", () => {
    const rules = [
      rule("bad", {
        contentAnalyses: () => {
          throw new Error("x");
        },
      }),
      rule("good", { contentAnalyses: () => [contentJob("https://x.test/1.js")] }),
    ];
    expect(planContentAnalyses(rules, input)).toHaveLength(1);
  });

  it("resolves the page data like evaluateRules", () => {
    const seen: any[] = [];
    const rules = [rule("a", { contentAnalyses: (ctx) => (seen.push(ctx.page, ctx.url), []) })];
    planContentAnalyses(rules, { ...input, pageData: { a: { ok: true, data: "A" } } });
    expect(seen).toEqual(["A", "https://example.com"]);
  });
});
