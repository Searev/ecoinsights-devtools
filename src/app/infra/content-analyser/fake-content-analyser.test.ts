import { describe, expect, it } from "vitest";
import { removableShare } from "../../domain/models/text-content";
import { MINIFIED_MAX_REMOVABLE_SHARE } from "../../domain/text-content/policy";
import { FakeContentAnalyser } from "./fake-content-analyser";

describe("FakeContentAnalyser", () => {
  it("analyses a .min. URL as minified (1 % removable)", async () => {
    const outcome = await new FakeContentAnalyser().analyse({ url: "https://a.b/app.min.js", type: "JS" });
    expect(outcome.status).toBe("analysed");
    if (outcome.status !== "analysed") return;
    expect(removableShare(outcome)).toBeCloseTo(0.01);
    expect(removableShare(outcome)).toBeLessThan(MINIFIED_MAX_REMOVABLE_SHARE);
  });

  it("analyses any other URL as not minified (20 % removable)", async () => {
    const outcome = await new FakeContentAnalyser().analyse({ url: "https://a.b/style.css", type: "CSS" });
    expect(outcome.status).toBe("analysed");
    if (outcome.status !== "analysed") return;
    expect(removableShare(outcome)).toBeCloseTo(0.2);
  });

  it("is deterministic", async () => {
    const analyser = new FakeContentAnalyser();
    const job = { url: "https://a.b/x.js", type: "JS" as const };
    expect(await analyser.analyse(job)).toEqual(await analyser.analyse(job));
  });
});
