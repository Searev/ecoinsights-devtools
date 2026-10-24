/**
 * US-020: strings and pure helpers of the text file preview. Every user-visible string lives here.
 */
import { formatKo } from "../../../domain/best-practices/rules/image-rule-helpers";
import { formatCount } from "../../../domain/best-practices/rules/rule-lines";
import { TextPreviewType } from "../../../domain/models/best-practice";
import { MAX_PREVIEW_TEXT_CHARS } from "../../../domain/file-preview/policy";
import { PreviewFileError, PreviewTextInfo, TextPreviewSubject } from "../../../domain/models/file-preview";
import { InfoRow } from "./info-rows";
import { TextDocument } from "./text-document";

export const TEXT_LOADING = "Chargement du fichier…";
export const TEXT_EMPTY = "Fichier vide.";
export const TEXT_CONTENT_LABEL = "Contenu du fichier";

const TYPE_LABELS: Record<TextPreviewType, string> = {
  CSS: "CSS",
  JS: "JavaScript",
  HTML: "HTML",
  SVG: "SVG",
  JSON: "JSON",
};

export const textTypeLabel = (type: TextPreviewType): string => TYPE_LABELS[type];

export function textInfoRows(subject: TextPreviewSubject, info: PreviewTextInfo, document: TextDocument): InfoRow[] {
  return [
    { label: "Type", value: textTypeLabel(subject.fileType) },
    { label: "Poids", value: formatKo(info.byteLength) },
    { label: "Lignes", value: formatCount(document.lineCount) },
  ];
}

/** Notice shown when the display is cut; undefined otherwise. */
export function textCapNotice(info: PreviewTextInfo, document: TextDocument): string | undefined {
  if (!document.truncated) return undefined;
  return `Affichage limité aux ${formatCount(MAX_PREVIEW_TEXT_CHARS / 1000)} premiers ko (fichier de ${formatKo(info.byteLength)}).`;
}

export function textErrorMessage(error: PreviewFileError): string {
  return error === "too-large" ? "Fichier trop volumineux pour être affiché." : "Fichier indisponible.";
}

/** Digits of the largest line number, at least 2 (gutter width in `ch`). */
export function gutterDigits(lineCount: number): number {
  return Math.max(2, String(Math.max(0, Math.floor(lineCount))).length);
}
