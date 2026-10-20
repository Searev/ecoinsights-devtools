import { describe, expect, it } from "vitest";
import { ImageFileInfo } from "../../../domain/models/image-variants";
import {
  CHANGED_NOTICE,
  CLOSE_LABEL,
  MODE_NATIVE_LABEL,
  MODE_PAGE_LABEL,
  NOT_DISPLAYED_HINT,
  RETRY_LABEL,
  errorMessage,
  formatFileFormat,
  formatGain,
  formatResolution,
  formatSize,
  loadingMessage,
  versionAlt,
} from "./comparison-format";

const info = (o: Partial<ImageFileInfo> = {}): ImageFileInfo => ({
  format: "jpeg",
  width: 1200,
  height: 800,
  byteLength: 240_000,
  mimeType: "image/jpeg",
  ...o,
});

describe("comparison-format", () => {
  it("S1: formats the resolution without thousands separator", () => {
    expect(formatResolution(1200, 800)).toBe("1200 × 800 px");
    expect(formatResolution(10000, 5)).toBe("10000 × 5 px");
  });

  it("S1: formats sizes in ko", () => {
    expect(formatSize(240_000)).toBe("240 ko");
  });

  it("S1/S2: formats the file format", () => {
    expect(formatFileFormat(info())).toBe("JPEG");
    expect(formatFileFormat(info({ format: "png" }))).toBe("PNG");
    expect(formatFileFormat(info({ format: "webp" }))).toBe("WebP");
    expect(formatFileFormat(info({ format: "webp", lossless: true }))).toBe("WebP sans perte");
    expect(formatFileFormat(info({ format: "avif" }))).toBe("AVIF");
    expect(formatFileFormat(info({ format: "gif" }))).toBe("GIF");
  });

  it("S1: formats the gain with a real minus sign", () => {
    expect(formatGain(240_000, 96_000)).toBe("−144 ko (−60 %)");
  });

  it("L9: formats a negative gain with a plus sign and a zero gain plainly", () => {
    expect(formatGain(100_000, 103_000)).toBe("+3 ko (+3 %)");
    expect(formatGain(100_000, 100_000)).toBe("0 ko (0 %)");
    expect(formatGain(0, 0)).toBe("0 ko (0 %)");
  });

  it("a11y: builds alt texts per version (L7)", () => {
    const avif = info({ format: "avif", byteLength: 96_000 });
    expect(versionAlt({ id: "converted", label: "AVIF" }, avif, "photo.jpg")).toBe(
      "Version AVIF de photo.jpg, 1200 × 800 px, 96 ko"
    );
    expect(versionAlt({ id: "original", label: "Originale" }, info(), "photo.jpg")).toBe(
      "Version originale de photo.jpg, 1200 × 800 px, 240 ko"
    );
    expect(
      versionAlt({ id: "resized", label: "Redimensionnée" }, info({ width: 600, height: 400, byteLength: 70_000 }), "photo.jpg")
    ).toBe("Version redimensionnée de photo.jpg, 600 × 400 px, 70 ko");
    expect(versionAlt({ id: "both", label: "Les deux" }, avif, "photo.jpg")).toBe(
      "Version redimensionnée et convertie en AVIF de photo.jpg, 1200 × 800 px, 96 ko"
    );
  });

  it("S1/S9/S10: messages are verbatim", () => {
    expect(loadingMessage("original")).toBe("Chargement de l'image originale…");
    expect(loadingMessage("resized")).toBe("Génération de la version optimisée…");
    expect(loadingMessage("both")).toBe("Génération de la version optimisée…");
    expect(errorMessage("original-unavailable")).toBe("Image originale indisponible.");
    expect(errorMessage("generation-failed")).toBe("La version optimisée n'a pas pu être générée.");
    expect(errorMessage("display-failed")).toBe("Votre navigateur ne peut pas afficher ce format.");
    expect(CHANGED_NOTICE).toBe(
      "L'image a changé depuis l'analyse : les tailles affichées peuvent différer de l'estimation."
    );
    expect(RETRY_LABEL).toBe("Réessayer");
    expect(CLOSE_LABEL).toBe("Fermer");
    expect(MODE_PAGE_LABEL).toBe("Même taille que sur la page");
    expect(MODE_NATIVE_LABEL).toBe("Taille réelle");
    expect(NOT_DISPLAYED_HINT).toBe("Image non affichée sur la page");
  });
});
