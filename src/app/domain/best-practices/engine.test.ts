import { describe, expect, it } from "vitest";
import { collectableRuleIds, evaluateRules } from "./engine";
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
