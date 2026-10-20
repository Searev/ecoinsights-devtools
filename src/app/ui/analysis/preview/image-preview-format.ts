/** Pure text helpers of the image preview (US-015). Every string is the story's, verbatim. */
import { formatKo } from "../../../domain/best-practices/rules/image-rule-helpers";
import { PreviewFileError, PreviewImageInfo } from "../../../domain/models/file-preview";
import { formatResolution } from "../comparison/comparison-format";
import { Size } from "../comparison/comparison-layout";
import { InfoRow } from "./info-rows";

export function imageFormatLabel(info: Pick<PreviewImageInfo, "format" | "animated">): string {
  switch (info.format) {
    case "jpeg":
      return "JPEG";
    case "png":
      return "PNG";
    case "webp":
      return "WebP";
    case "avif":
      return "AVIF";
    case "gif":
      return info.animated ? "GIF animé" : "GIF";
    case "svg":
      return "SVG";
    case "bmp":
      return "BMP";
    case "ico":
      return "ICO";
    default:
      return "inconnu";
  }
}

/** The resolution to show, or undefined for a vector image without size or when nothing is known. */
function knownResolution(info: PreviewImageInfo, decoded?: Size): string | undefined {
  if (info.width !== undefined && info.height !== undefined && info.width > 0 && info.height > 0) {
    return formatResolution(info.width, info.height);
  }
  if (!info.vector && decoded !== undefined && decoded.width > 0 && decoded.height > 0) {
    return formatResolution(decoded.width, decoded.height);
  }
  return undefined;
}

export function imageResolution(info: PreviewImageInfo, decoded?: Size): string {
  return knownResolution(info, decoded) ?? (info.vector ? "non définie (image vectorielle)" : "inconnue");
}

export function imageInfoRows(info: PreviewImageInfo, decoded?: Size): InfoRow[] {
  return [
    { label: "Résolution", value: imageResolution(info, decoded) },
    { label: "Format", value: imageFormatLabel(info) },
    { label: "Poids", value: formatKo(info.byteLength) },
  ];
}

/** "Aperçu de hero.jpg, 1200 × 800 px, 180 ko"; the resolution is omitted when unknown or vector. */
export function imagePreviewAlt(fullName: string, info: PreviewImageInfo, decoded?: Size): string {
  const resolution = knownResolution(info, decoded);
  return `Aperçu de ${fullName}, ${resolution === undefined ? "" : `${resolution}, `}${formatKo(info.byteLength)}`;
}

export function imageErrorMessage(error: PreviewFileError | "display-failed"): string {
  switch (error) {
    case "unavailable":
      return "Image indisponible.";
    case "too-large":
      return "Image trop volumineuse pour l'aperçu.";
    case "display-failed":
      return "Ce format d'image ne peut pas être affiché.";
  }
}
