/**
 * Image format detection from the first bytes of a file (magic numbers), and the US-002 rule
 * "MIME type first, signature for missing or generic types". Pure; used by the codec worker and
 * the bytes source. See docs/architecture/ARCH-DECISION-011 §5.
 */
import { ImageFormat } from "../models/image-estimation";
import { formatFromMime } from "./image-requests";

const startsWith = (head: Uint8Array, sig: number[], offset = 0) =>
  head.length >= offset + sig.length && sig.every((b, i) => head[offset + i] === b);

const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

/** Format from the file signature. 32 bytes are enough; returns "unknown" when nothing matches. */
export function sniffImageFormat(head: Uint8Array): ImageFormat {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8)) return "webp";
  if (
    startsWith(head, ascii("ftyp"), 4) &&
    (startsWith(head, ascii("avif"), 8) || startsWith(head, ascii("avis"), 8))
  ) {
    return "avif";
  }
  if (startsWith(head, ascii("GIF87a")) || startsWith(head, ascii("GIF89a"))) return "gif";
  if (startsWith(head, ascii("BM"))) return "bmp";
  if (startsWith(head, [0, 0, 1, 0])) return "ico";
  if (startsWith(head, [0x49, 0x49, 0x2a, 0]) || startsWith(head, [0x4d, 0x4d, 0, 0x2a])) {
    return "tiff";
  }
  const text = String.fromCharCode(...Array.from(head.subarray(0, 32))).trimStart();
  if (text.startsWith("<svg") || text.startsWith("<?xml")) return "svg";
  return "unknown";
}

/** MIME type first (never the extension); signature for a missing, generic or unknown image type. */
export function detectImageFormat(declaredType: string, head: Uint8Array): ImageFormat {
  const fromMime = formatFromMime(declaredType);
  if (fromMime !== undefined && fromMime !== "generic" && fromMime !== "unknown") {
    return fromMime;
  }
  return sniffImageFormat(head);
}
