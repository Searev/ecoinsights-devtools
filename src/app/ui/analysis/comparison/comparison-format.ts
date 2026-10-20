/** Pure text helpers of the comparison dialog (US-005). Every string is the story's, verbatim. */
import { formatKo } from "../../../domain/best-practices/rules/image-rule-helpers";
import {
  ComparisonVersion,
  ImageFileError,
  ImageFileInfo,
  ImageVersionId,
} from "../../../domain/models/image-variants";

export const CHANGED_NOTICE =
  "L'image a changé depuis l'analyse : les tailles affichées peuvent différer de l'estimation.";
export const RETRY_LABEL = "Réessayer";
export const CLOSE_LABEL = "Fermer";
export const MODE_PAGE_LABEL = "Même taille que sur la page";
export const MODE_NATIVE_LABEL = "Taille réelle";
export const NOT_DISPLAYED_HINT = "Image non affichée sur la page";

const MINUS = "−";

export function formatResolution(width: number, height: number): string {
  return `${width} × ${height} px`;
}

export const formatSize = formatKo;

export function formatFileFormat(info: Pick<ImageFileInfo, "format" | "lossless">): string {
  switch (info.format) {
    case "jpeg":
      return "JPEG";
    case "png":
      return "PNG";
    case "avif":
      return "AVIF";
    case "webp":
      return info.lossless ? "WebP sans perte" : "WebP";
    default:
      return String(info.format).toUpperCase();
  }
}

/** "−144 ko (−60 %)"; a larger variant shows "+3 ko (+3 %)" (L9), no change "0 ko (0 %)". */
export function formatGain(referenceBytes: number, variantBytes: number): string {
  const diff = referenceBytes - variantBytes;
  if (diff === 0) return "0 ko (0 %)";
  const percent = referenceBytes > 0 ? Math.round((Math.abs(diff) * 100) / referenceBytes) : 0;
  const sign = diff > 0 ? MINUS : "+";
  return `${sign}${formatKo(Math.abs(diff))} (${sign}${percent} %)`;
}

/** Alt text of a displayed version (L7). */
export function versionAlt(
  version: Pick<ComparisonVersion, "id" | "label">,
  info: ImageFileInfo,
  fullName: string
): string {
  const format = formatFileFormat(info);
  const kind =
    version.id === "original"
      ? "originale"
      : version.id === "resized"
        ? "redimensionnée"
        : version.id === "both"
          ? `redimensionnée et convertie en ${format}`
          : format;
  return `Version ${kind} de ${fullName}, ${formatResolution(info.width, info.height)}, ${formatSize(info.byteLength)}`;
}

export function loadingMessage(id: ImageVersionId): string {
  return id === "original"
    ? "Chargement de l'image originale…"
    : "Génération de la version optimisée…";
}

export function errorMessage(error: ImageFileError | "display-failed"): string {
  switch (error) {
    case "original-unavailable":
      return "Image originale indisponible.";
    case "generation-failed":
      return "La version optimisée n'a pas pu être générée.";
    case "display-failed":
      return "Votre navigateur ne peut pas afficher ce format.";
  }
}
