import { MIME_FORMATS } from "../../domain/image-estimation/policy";
import { sniffImageFormat } from "../../domain/image-estimation/signature";
import { PreviewImageFormat, PreviewImageInfo } from "../../domain/models/file-preview";
import { readDimensions } from "../image-codec/image-inspect";

interface Size {
  width: number;
  height: number;
}

const SNIFF_BYTES = 64;
const SVG_HEAD_BYTES = 4096;

const CANONICAL_MIME: Readonly<Partial<Record<PreviewImageFormat, string>>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const i32le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);

const size = (width: number, height: number): Size | undefined =>
  Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : undefined;

/** Walks the GIF blocks and counts the image descriptors found (a truncated file gives the count so far). */
function countGifFrames(b: Uint8Array): number {
  if (b.length < 13) return 0;
  let o = 13;
  if (b[10] & 0x80) o += 3 * 2 ** ((b[10] & 7) + 1);
  const skipSubBlocks = () => {
    while (o < b.length) {
      const len = b[o++];
      if (len === 0) return;
      o += len;
    }
  };
  let frames = 0;
  while (o < b.length) {
    const marker = b[o++];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      o++; // extension label
      skipSubBlocks();
    } else if (marker === 0x2c) {
      frames++;
      const packed = b[o + 8];
      o += 9;
      if (packed !== undefined && packed & 0x80) o += 3 * 2 ** ((packed & 7) + 1);
      o++; // LZW minimum code size
      skipSubBlocks();
    } else {
      break; // corrupt
    }
  }
  return frames;
}

function bmpSize(b: Uint8Array): Size | undefined {
  if (b.length < 26) return undefined;
  if (i32le(b, 14) === 12) return size(u16le(b, 18), u16le(b, 20));
  if (b.length < 26) return undefined;
  return size(i32le(b, 18), Math.abs(i32le(b, 22)));
}

function icoSize(b: Uint8Array): Size | undefined {
  const count = u16le(b, 4);
  let best: Size | undefined;
  for (let i = 0; i < count && 6 + (i + 1) * 16 <= b.length; i++) {
    const o = 6 + i * 16;
    const found = { width: b[o] || 256, height: b[o + 1] || 256 };
    if (!best || found.width * found.height > best.width * best.height) best = found;
  }
  return best;
}

const SVG_ROOT = /<svg(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/i;

function svgRootAttributes(bytes: Uint8Array): string | undefined {
  const head = new TextDecoder().decode(bytes.subarray(0, SVG_HEAD_BYTES));
  const cleaned = head
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, "");
  return SVG_ROOT.exec(cleaned)?.[1];
}

function svgLength(attributes: string, name: "width" | "height"): number | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(attributes);
  const value = match?.[1] ?? match?.[2];
  const number = value === undefined ? undefined : /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(?:px)?\s*$/i.exec(value)?.[1];
  const parsed = number === undefined ? NaN : Number(number);
  return parsed > 0 ? parsed : undefined;
}

function svgSize(attributes: string): Size | undefined {
  const width = svgLength(attributes, "width");
  const height = svgLength(attributes, "height");
  return width !== undefined && height !== undefined ? { width, height } : undefined;
}

function resolveFormat(bytes: Uint8Array, mime: string): PreviewImageFormat | undefined {
  const sniffed = sniffImageFormat(bytes.subarray(0, SNIFF_BYTES));
  if (sniffed !== "unknown") return sniffed === "tiff" ? "unknown" : sniffed;
  const byMime = MIME_FORMATS[mime];
  if (byMime) return byMime === "tiff" ? "unknown" : byMime;
  return mime.startsWith("image/") ? "unknown" : undefined;
}

/**
 * Describes the bytes of an image from their headers only (ARCH-DECISION-022). Pure; undefined means
 * "not an image": no known signature and a MIME type that is not `image/*`.
 */
export function describePreviewImage(bytes: Uint8Array, mimeType: string): PreviewImageInfo | undefined {
  const mime = mimeType.split(";")[0].trim().toLowerCase();
  const format = resolveFormat(bytes, mime);
  if (format === undefined) return undefined;

  let dimensions: Size | undefined;
  let animated = false;
  switch (format) {
    case "gif":
      dimensions = bytes.length >= 10 ? size(u16le(bytes, 6), u16le(bytes, 8)) : undefined;
      animated = countGifFrames(bytes) > 1;
      break;
    case "bmp":
      dimensions = bmpSize(bytes);
      break;
    case "ico":
      dimensions = icoSize(bytes);
      break;
    case "svg": {
      const attributes = svgRootAttributes(bytes);
      // An XML document that is not an SVG is only an image when its MIME type says so.
      if (attributes === undefined && mime !== "image/svg+xml") return undefined;
      dimensions = attributes === undefined ? undefined : svgSize(attributes);
      break;
    }
    default:
      dimensions = readDimensions(format, bytes);
  }

  const info: PreviewImageInfo = {
    format,
    animated,
    vector: format === "svg",
    byteLength: bytes.length,
    mimeType: CANONICAL_MIME[format] ?? (mime || "application/octet-stream"),
  };
  if (dimensions) {
    info.width = dimensions.width;
    info.height = dimensions.height;
  }
  return info;
}
