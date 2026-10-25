import { describe, expect, it } from "vitest";
import { RULE_METADATA } from "../../domain/best-practices/rule-metadata";
import { parseRichText } from "./rich-text";

describe("parseRichText", () => {
  it("returns one plain segment for a plain line", () => {
    expect(parseRichText("hello")).toEqual([[{ text: "hello", bold: false }]]);
  });

  it("splits bold segments within a line", () => {
    expect(parseRichText("a **b** c")).toEqual([
      [
        { text: "a ", bold: false },
        { text: "b", bold: true },
        { text: " c", bold: false },
      ],
    ]);
  });

  it("handles several bold segments and bold at the edges", () => {
    expect(parseRichText("**a** et **b**")).toEqual([
      [
        { text: "a", bold: true },
        { text: " et ", bold: false },
        { text: "b", bold: true },
      ],
    ]);
  });

  it("splits on \\n and normalises \\r\\n", () => {
    expect(parseRichText("a\r\nb\nc")).toHaveLength(3);
    expect(parseRichText("a\r\nb")[0]).toEqual([{ text: "a", bold: false }]);
  });

  it("gives [] for an empty line", () => {
    expect(parseRichText("a\n\nb")).toEqual([[{ text: "a", bold: false }], [], [{ text: "b", bold: false }]]);
    expect(parseRichText("")).toEqual([[]]);
  });

  it("keeps an unmatched ** literal", () => {
    expect(parseRichText("a **x")).toEqual([[{ text: "a **x", bold: false }]]);
  });

  it("keeps a single * literal", () => {
    expect(parseRichText("a * b")).toEqual([[{ text: "a * b", bold: false }]]);
  });

  it("keeps **** literal", () => {
    expect(parseRichText("a **** b")).toEqual([[{ text: "a **** b", bold: false }]]);
  });

  it("does not match a bold across lines", () => {
    expect(parseRichText("**a\nb**")).toEqual([[{ text: "**a", bold: false }], [{ text: "b**", bold: false }]]);
  });

  it("never interprets HTML", () => {
    expect(parseRichText("pas de <video> ni <audio>")).toEqual([[{ text: "pas de <video> ni <audio>", bold: false }]]);
  });

  it("gives six lines for PreferHttp2 with multiplexage and priorisation in bold", () => {
    const lines = parseRichText(RULE_METADATA.PreferHttp2.description!);
    expect(lines).toHaveLength(6);
    const bold = lines.flat().filter((s) => s.bold).map((s) => s.text);
    expect(bold).toEqual(["multiplexage", "priorisation"]);
  });

  it("keeps <video> and <audio> as plain text for AvoidMediaAutoplay", () => {
    const segments = parseRichText(RULE_METADATA.AvoidMediaAutoplay.description!).flat();
    expect(segments.every((s) => !s.bold)).toBe(true);
    expect(segments.map((s) => s.text).join("")).toContain("<video> ou <audio>");
  });
});
