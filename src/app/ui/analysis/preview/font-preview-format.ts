/**
 * US-018: strings and pure helpers of the font preview. Every user-visible string lives here.
 */
import { formatKo } from "../../../domain/best-practices/rules/image-rule-helpers";
import { FontFormat, PreviewFontInfo } from "../../../domain/models/file-preview";
import { InfoRow } from "./info-rows";

/** Sample text, with the typographic apostrophe U+2019. */
export const FONT_SAMPLE_TEXT =
  "Tâcher de se vaincre plutôt que la fortune, et changer ses désirs plutôt que l’ordre du monde";
/** Em dash U+2014 then a space. */
export const FONT_SAMPLE_AUTHOR = "— Voltaire";
export const FONT_SAMPLE_SIZE_PX = 32;
export const FONT_GROUP_LABEL = "Police";
export const FONT_LOADING = "Chargement de la police…";

export type FontChoiceId = "downloaded" | "sans" | "serif" | "mono";

export interface FontChoice {
  id: FontChoiceId;
  label: string;
  /** `font-family` of a system choice; undefined for the downloaded font. */
  stack?: string;
}

export const FONT_CHOICES: readonly FontChoice[] = [
  { id: "downloaded", label: "Police téléchargée" },
  {
    id: "sans",
    label: "Sans-serif",
    stack:
      "-apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, Adwaita Sans, Cantarell, Ubuntu, roboto, noto, helvetica, arial, sans-serif",
  },
  {
    id: "serif",
    label: "Serif",
    stack:
      "Iowan Old Style, Apple Garamond, Baskerville, Times New Roman, Droid Serif, Times, Source Serif Pro, serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol",
  },
  {
    id: "mono",
    label: "Mono",
    stack: "Menlo, Consolas, Monaco, Adwaita Mono, Liberation Mono, Lucida Console, monospace",
  },
];

/** `font-family` of the sample: the stack of a system choice, the quoted private family otherwise. */
export function sampleFontFamily(choice: FontChoiceId, family?: string): string {
  if (choice === "downloaded") return family === undefined ? "inherit" : `"${family}"`;
  return FONT_CHOICES.find((c) => c.id === choice)!.stack!;
}

const FORMAT_LABELS: Record<FontFormat, string> = {
  woff2: "WOFF2",
  woff: "WOFF",
  ttf: "TTF",
  otf: "OTF",
  eot: "EOT",
  unknown: "inconnu",
};

export const fontFormatLabel = (format: FontFormat): string => FORMAT_LABELS[format];

export function fontInfoRows(info: PreviewFontInfo): InfoRow[] {
  return [
    { label: "Format", value: fontFormatLabel(info.format) },
    { label: "Poids", value: formatKo(info.byteLength) },
  ];
}

export type FontError = "unavailable" | "unsupported";

export function fontErrorMessage(error: FontError): string {
  return error === "unsupported"
    ? "Ce format de police n'est pas pris en charge par ce navigateur."
    : "Police indisponible.";
}
