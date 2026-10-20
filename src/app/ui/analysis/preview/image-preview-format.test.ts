import { describe, expect, it } from "vitest";
import { formatKo } from "../../../domain/best-practices/rules/image-rule-helpers";
import { PreviewImageInfo } from "../../../domain/models/file-preview";
import {
  imageErrorMessage,
  imageFormatLabel,
  imageInfoRows,
  imagePreviewAlt,
  imageResolution,
} from "./image-preview-format";

function info(o: Partial<PreviewImageInfo> = {}): PreviewImageInfo {
  return {
    format: "jpeg",
    animated: false,
    vector: false,
    width: 1200,
    height: 800,
    byteLength: 180_000,
    mimeType: "image/jpeg",
    ...o,
  };
}

describe("imageFormatLabel", () => {
  it.each([
    ["jpeg", "JPEG"],
    ["png", "PNG"],
    ["webp", "WebP"],
    ["avif", "AVIF"],
    ["gif", "GIF"],
    ["svg", "SVG"],
    ["bmp", "BMP"],
    ["ico", "ICO"],
    ["unknown", "inconnu"],
  ] as const)("%s -> %s", (format, label) => {
    expect(imageFormatLabel(info({ format }))).toBe(label);
  });

  it("labels an animated GIF", () => {
    expect(imageFormatLabel(info({ format: "gif", animated: true }))).toBe("GIF animé");
  });
});

describe("imageResolution", () => {
  it("uses the size read from the file", () => {
    expect(imageResolution(info())).toBe("1200 × 800 px");
  });
  it("ignores the decoded size when the file has one", () => {
    expect(imageResolution(info(), { width: 5, height: 5 })).toBe("1200 × 800 px");
  });
  it("says a vector image has no defined size", () => {
    expect(imageResolution(info({ format: "svg", vector: true, width: undefined, height: undefined }))).toBe(
      "non définie (image vectorielle)"
    );
  });
  it("never uses the decoded size of a vector", () => {
    const svg = info({ format: "svg", vector: true, width: undefined, height: undefined });
    expect(imageResolution(svg, { width: 300, height: 150 })).toBe("non définie (image vectorielle)");
  });
  it("falls back to the decoded size of a raster", () => {
    expect(imageResolution(info({ width: undefined, height: undefined }), { width: 64, height: 32 })).toBe(
      "64 × 32 px"
    );
  });
  it("is unknown without any size or with a non-positive decoded size", () => {
    const none = info({ width: undefined, height: undefined });
    expect(imageResolution(none)).toBe("inconnue");
    expect(imageResolution(none, { width: 0, height: 0 })).toBe("inconnue");
  });
});

describe("imageInfoRows", () => {
  it("lists resolution, format and weight", () => {
    expect(imageInfoRows(info())).toEqual([
      { label: "Résolution", value: "1200 × 800 px" },
      { label: "Format", value: "JPEG" },
      { label: "Poids", value: formatKo(180_000) },
    ]);
  });
});

describe("imagePreviewAlt", () => {
  it("includes name, resolution and weight", () => {
    expect(imagePreviewAlt("hero.jpg", info())).toBe(`Aperçu de hero.jpg, 1200 × 800 px, ${formatKo(180_000)}`);
  });
  it("omits the resolution when unknown or vector", () => {
    const none = info({ width: undefined, height: undefined });
    expect(imagePreviewAlt("a.png", none)).toBe(`Aperçu de a.png, ${formatKo(180_000)}`);
    const svg = info({ format: "svg", vector: true, width: undefined, height: undefined });
    expect(imagePreviewAlt("logo.svg", svg, { width: 10, height: 10 })).toBe(
      `Aperçu de logo.svg, ${formatKo(180_000)}`
    );
  });
  it("uses the decoded size of a raster", () => {
    const none = info({ width: undefined, height: undefined });
    expect(imagePreviewAlt("a.bmp", none, { width: 4, height: 2 })).toBe(
      `Aperçu de a.bmp, 4 × 2 px, ${formatKo(180_000)}`
    );
  });
});

describe("imageErrorMessage", () => {
  it("has the three story messages", () => {
    expect(imageErrorMessage("unavailable")).toBe("Image indisponible.");
    expect(imageErrorMessage("too-large")).toBe("Image trop volumineuse pour l'aperçu.");
    expect(imageErrorMessage("display-failed")).toBe("Ce format d'image ne peut pas être affiché.");
  });
});
