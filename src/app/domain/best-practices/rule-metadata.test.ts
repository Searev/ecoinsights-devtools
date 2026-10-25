import { describe, expect, it } from "vitest";
import { RULE_METADATA, ruleMetadata } from "./rule-metadata";

describe("RULE_METADATA descriptions", () => {
  it.each(Object.entries(RULE_METADATA))("%s description presence follows the story", (id, meta) => {
      expect(typeof meta.description).toBe("string");
  });

  it("never holds an empty or placeholder text", () => {
    for (const meta of Object.values(RULE_METADATA)) {
      for (const value of [meta.description, meta.link, meta.reference?.code]) {
        if (value === undefined) continue;
        expect(value.trim()).not.toBe("");
        expect(value).not.toContain("xxxx");
      }
    }
  });

  it("starts the AddCacheHeaders text with its first sentence", () => {
    expect(RULE_METADATA.AddCacheHeaders.description).toMatch(
      /^Les en-têtes Expires et Cache-Control définissent la durée pendant laquelle un navigateur doit conserver une ressource dans son cache\. /,
    );
  });

  it("keeps the systemfontstack URL as plain text and ends with 'par exemple.'", () => {
    const text = RULE_METADATA.UseStandardFonts.description!;
    expect(text).toContain("https://systemfontstack.com/");
    expect(text.endsWith("par exemple.")).toBe(true);
  });

  it("unescapes <video> and <audio> in AvoidMediaAutoplay", () => {
    const text = RULE_METADATA.AvoidMediaAutoplay.description!;
    expect(text).toContain("<video>");
    expect(text).toContain("<audio>");
    expect(text).not.toContain("\\");
  });

  it("has six lines for PreferHttp2, with trimmed bold markers", () => {
    const text = RULE_METADATA.PreferHttp2.description!;
    expect(text.split("\n")).toHaveLength(6);
    expect(text).toContain("**multiplexage**");
    expect(text).toContain("**priorisation**");
    expect(text).not.toContain("**multiplexage **");
  });
});

describe("ruleMetadata", () => {
  it("returns the entry of a known id", () => {
    expect(ruleMetadata("LimitCanvas")).toBe(RULE_METADATA.LimitCanvas);
  });

  it("returns {} for an unknown id", () => {
    expect(ruleMetadata("Unknown")).toEqual({});
  });
});
