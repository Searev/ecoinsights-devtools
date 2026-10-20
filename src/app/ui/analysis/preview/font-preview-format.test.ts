import { describe, expect, it } from "vitest";
import { formatKo } from "../../../domain/best-practices/rules/image-rule-helpers";
import {
  FONT_CHOICES,
  FONT_GROUP_LABEL,
  FONT_LOADING,
  FONT_SAMPLE_AUTHOR,
  FONT_SAMPLE_SIZE_PX,
  FONT_SAMPLE_TEXT,
  fontErrorMessage,
  fontFormatLabel,
  fontInfoRows,
  sampleFontFamily,
} from "./font-preview-format";

const SANS =
  "-apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, Adwaita Sans, Cantarell, Ubuntu, roboto, noto, helvetica, arial, sans-serif";
const SERIF =
  "Iowan Old Style, Apple Garamond, Baskerville, Times New Roman, Droid Serif, Times, Source Serif Pro, serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol";
const MONO = "Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace";

describe("font preview strings", () => {
  it("has the Voltaire sample with a typographic apostrophe", () => {
    expect(FONT_SAMPLE_TEXT).toBe(
      "Tâcher de se vaincre plutôt que la fortune, et changer ses désirs plutôt que l’ordre du monde"
    );
    expect(FONT_SAMPLE_TEXT).toContain("l’ordre");
    expect(FONT_SAMPLE_TEXT.codePointAt(FONT_SAMPLE_TEXT.indexOf("l’ordre") + 1)).toBe(0x2019);
    expect(FONT_SAMPLE_AUTHOR).toBe("— Voltaire");
    expect(FONT_SAMPLE_SIZE_PX).toBe(32);
    expect(FONT_GROUP_LABEL).toBe("Police");
    expect(FONT_LOADING).toBe("Chargement de la police…");
  });

  it("lists the four choices with the exact stacks", () => {
    expect(FONT_CHOICES.map((c) => [c.id, c.label])).toEqual([
      ["downloaded", "Police téléchargée"],
      ["sans", "Sans-serif"],
      ["serif", "Serif"],
      ["mono", "Mono"],
    ]);
    expect(sampleFontFamily("sans")).toBe(SANS);
    expect(sampleFontFamily("serif")).toBe(SERIF);
    expect(sampleFontFamily("mono")).toBe(MONO);
  });

  it("quotes the downloaded family", () => {
    expect(sampleFontFamily("downloaded", "ecoinsights-preview-3")).toBe('"ecoinsights-preview-3"');
    expect(sampleFontFamily("downloaded")).toBe("inherit");
  });

  it("labels formats", () => {
    expect(
      (["woff2", "woff", "ttf", "otf", "eot", "unknown"] as const).map(fontFormatLabel)
    ).toEqual(["WOFF2", "WOFF", "TTF", "OTF", "EOT", "inconnu"]);
  });

  it("builds the info rows", () => {
    expect(fontInfoRows({ format: "woff2", byteLength: 64_000, mimeType: "font/woff2" })).toEqual([
      { label: "Format", value: "WOFF2" },
      { label: "Poids", value: formatKo(64_000) },
    ]);
  });

  it("has the error messages", () => {
    expect(fontErrorMessage("unavailable")).toBe("Police indisponible.");
    expect(fontErrorMessage("unsupported")).toBe(
      "Ce format de police n'est pas pris en charge par ce navigateur."
    );
  });
});
