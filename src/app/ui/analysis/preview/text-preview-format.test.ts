import { describe, expect, it } from "vitest";
import { formatKo } from "../../../domain/best-practices/rules/image-rule-helpers";
import { formatCount } from "../../../domain/best-practices/rules/rule-lines";
import { MAX_PREVIEW_TEXT_CHARS } from "../../../domain/file-preview/policy";
import { PreviewTextInfo, TextPreviewSubject } from "../../../domain/models/file-preview";
import { TextDocument } from "./text-document";
import {
  TEXT_CONTENT_LABEL,
  TEXT_EMPTY,
  TEXT_LOADING,
  gutterDigits,
  textCapNotice,
  textErrorMessage,
  textInfoRows,
  textTypeLabel,
} from "./text-preview-format";

const SUBJECT: TextPreviewSubject = {
  kind: "text",
  url: "https://x.test/a.css",
  ruleId: "MinifyTextFiles",
  fileType: "CSS",
  declaredType: "text/css",
};
const info = (byteLength: number): PreviewTextInfo => ({ byteLength, mimeType: "text/css", charset: "utf-8" });
const doc = (lineCount: number, truncated = false): TextDocument => ({
  characters: 0,
  lineCount,
  truncated,
  lines: [],
});

describe("text preview strings", () => {
  it("has the exact constants", () => {
    expect(TEXT_LOADING).toBe("Chargement du fichier…");
    expect(TEXT_EMPTY).toBe("Fichier vide.");
    expect(TEXT_CONTENT_LABEL).toBe("Contenu du fichier");
  });
  it("labels the types", () => {
    expect(textTypeLabel("CSS")).toBe("CSS");
    expect(textTypeLabel("JS")).toBe("JavaScript");
    expect(textTypeLabel("HTML")).toBe("HTML");
    expect(textTypeLabel("SVG")).toBe("SVG");
    expect(textTypeLabel("JSON")).toBe("JSON");
  });
  it("S1: info rows", () => {
    expect(textInfoRows(SUBJECT, info(48_000), doc(1234))).toEqual([
      { label: "Type", value: "CSS" },
      { label: "Poids", value: formatKo(48_000) },
      { label: "Lignes", value: formatCount(1234) },
    ]);
  });
  it("S14: empty rows", () => {
    const rows = textInfoRows({ ...SUBJECT, fileType: "JS" }, info(0), doc(0));
    expect(rows).toEqual([
      { label: "Type", value: "JavaScript" },
      { label: "Poids", value: "0 ko" },
      { label: "Lignes", value: "0" },
    ]);
  });
  it("S7: cap notice", () => {
    expect(textCapNotice(info(1_234_000), doc(10, true))).toBe(
      `Affichage limité aux 500 premiers ko (fichier de ${formatKo(1_234_000)}).`
    );
    expect(MAX_PREVIEW_TEXT_CHARS).toBe(500_000);
  });
  it("has no notice when not truncated", () => {
    expect(textCapNotice(info(10), doc(1))).toBeUndefined();
  });
  it("error messages", () => {
    expect(textErrorMessage("unavailable")).toBe("Fichier indisponible.");
    expect(textErrorMessage("too-large")).toBe("Fichier trop volumineux pour être affiché.");
  });
  it("gutter digits, at least 2", () => {
    expect(gutterDigits(0)).toBe(2);
    expect(gutterDigits(9)).toBe(2);
    expect(gutterDigits(99)).toBe(2);
    expect(gutterDigits(100)).toBe(3);
    expect(gutterDigits(12_345)).toBe(5);
  });
});
