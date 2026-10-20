import { FontFormat } from "../../domain/models/file-preview";

const startsWith = (head: Uint8Array, sig: number[]) => head.length >= sig.length && sig.every((b, i) => head[i] === b);
const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

const MIME_FORMATS: Readonly<Record<string, FontFormat>> = {
  "font/woff2": "woff2",
  "application/font-woff2": "woff2",
  "font/woff": "woff",
  "application/font-woff": "woff",
  "application/x-font-woff": "woff",
  "font/ttf": "ttf",
  "application/x-font-ttf": "ttf",
  "application/x-font-truetype": "ttf",
  "font/sfnt": "ttf",
  "application/font-sfnt": "ttf",
  "font/otf": "otf",
  "application/x-font-opentype": "otf",
  "application/font-otf": "otf",
  "application/vnd.ms-fontobject": "eot",
};

const EXTENSIONS: readonly FontFormat[] = ["woff2", "woff", "ttf", "otf", "eot"];

function fromSignature(head: Uint8Array): FontFormat {
  if (startsWith(head, ascii("wOF2"))) return "woff2";
  if (startsWith(head, ascii("wOFF"))) return "woff";
  if (startsWith(head, ascii("OTTO"))) return "otf";
  if (startsWith(head, [0, 1, 0, 0]) || startsWith(head, ascii("true"))) return "ttf";
  if (head.length >= 36 && head[34] === 0x4c && head[35] === 0x50) return "eot";
  return "unknown";
}

function fromUrlExtension(url: string): FontFormat {
  const path = url.split(/[?#]/)[0];
  const match = /\.([a-z0-9]+)$/i.exec(path);
  const ext = match?.[1].toLowerCase();
  return EXTENSIONS.find((e) => e === ext) ?? "unknown";
}

/** Font format: file signature first, then the MIME type, then the URL extension (ARCH-DECISION-022). Pure. */
export function detectFontFormat(head: Uint8Array, mimeType: string, url: string): FontFormat {
  const bySignature = fromSignature(head);
  if (bySignature !== "unknown") return bySignature;
  const byMime = MIME_FORMATS[mimeType.split(";")[0].trim().toLowerCase()];
  if (byMime) return byMime;
  return fromUrlExtension(url);
}
