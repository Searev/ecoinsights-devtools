import { describe, expect, it } from "vitest";
import { MAX_PREVIEW_TEXT_CHARS } from "../../../domain/file-preview/policy";
import { countLines, decodePreviewText, prepareTextDocument } from "./text-document";

describe("decodePreviewText", () => {
  it("decodes UTF-8", () => {
    expect(decodePreviewText(new TextEncoder().encode("café"), "utf-8")).toBe("café");
  });
  it("S11: decodes iso-8859-1", () => {
    expect(decodePreviewText(new Uint8Array([0x6c, 0xe9]), "iso-8859-1")).toBe("lé");
  });
  it("replaces invalid UTF-8 without throwing", () => {
    expect(decodePreviewText(new Uint8Array([0xff, 0x61]), "utf-8")).toBe("�a");
  });
  it("falls back to UTF-8 on an unknown label", () => {
    expect(decodePreviewText(new TextEncoder().encode("é"), "not-a-charset")).toBe("é");
  });
});

describe("countLines", () => {
  it.each([
    ["", 0],
    ["a", 1],
    ["a\nb\n", 2],
    ["\n", 1],
    ["a\nb", 2],
    ["a\r\nb\r\n", 2],
    ["a\rb\rc", 3],
    ["a\r\n\r\nb", 3],
    ["\n\n", 2],
  ])("counts %j as %i", (text, expected) => {
    expect(countLines(text)).toBe(expected);
  });
  it("counts 25 MB in a reasonable time", () => {
    const text = "0123456789abcdef\n".repeat(Math.ceil(25_000_000 / 17));
    const start = performance.now();
    expect(countLines(text)).toBe(Math.ceil(25_000_000 / 17));
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe("prepareTextDocument", () => {
  it("splits lines without a trailing empty row", () => {
    expect(prepareTextDocument("a\r\nb\rc\n")).toEqual({
      characters: 7,
      lineCount: 3,
      truncated: false,
      lines: ["a", "b", "c"],
    });
  });
  it("keeps empty lines in the middle", () => {
    expect(prepareTextDocument("a\n\nb").lines).toEqual(["a", "", "b"]);
  });
  it("S14: empty text", () => {
    expect(prepareTextDocument("")).toEqual({ characters: 0, lineCount: 0, truncated: false, lines: [] });
  });
  it("S9: one 80 000-character line is one line", () => {
    const doc = prepareTextDocument("x".repeat(80_000));
    expect(doc.lineCount).toBe(1);
    expect(doc.lines).toHaveLength(1);
    expect(doc.truncated).toBe(false);
  });
  it("S7: truncates at the cap and counts the whole text", () => {
    const text = "0123456789\n".repeat(112_000); // 1 232 000 chars
    const doc = prepareTextDocument(text);
    expect(doc.characters).toBe(text.length);
    expect(doc.truncated).toBe(true);
    expect(doc.lineCount).toBe(112_000);
    expect(doc.lines.join("\n").length).toBeLessThanOrEqual(MAX_PREVIEW_TEXT_CHARS);
    expect(doc.lines.join("\n").length).toBeGreaterThan(MAX_PREVIEW_TEXT_CHARS - 12);
  });
  it("displays exactly maxChars code units of a 1 234 000-character text", () => {
    const text = "x".repeat(1_234_000);
    const doc = prepareTextDocument(text);
    expect(doc.characters).toBe(1_234_000);
    expect(doc.truncated).toBe(true);
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]!.length).toBe(MAX_PREVIEW_TEXT_CHARS);
  });
  it("does not split a surrogate pair at the cut", () => {
    const text = "ab😀cd";
    const doc = prepareTextDocument(text, 3);
    expect(doc.truncated).toBe(true);
    expect(doc.lines).toEqual(["ab"]);
    expect(prepareTextDocument(text, 4).lines).toEqual(["ab😀"]);
  });
  it("is not truncated at exactly the cap", () => {
    const doc = prepareTextDocument("abc", 3);
    expect(doc.truncated).toBe(false);
    expect(doc.lines).toEqual(["abc"]);
  });
  it("a cut right after a break adds no empty row", () => {
    expect(prepareTextDocument("ab\ncd", 3).lines).toEqual(["ab"]);
  });
  it("a cut between CR and LF shows no extra row", () => {
    expect(prepareTextDocument("ab\r\ncd", 3).lines).toEqual(["ab"]);
  });
});
