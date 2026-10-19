/**
 * Cheap header inspection, run before any decoding (ARCH-DECISION-008): natural size (to refuse
 * oversized images without allocating their pixels), animation and WebP losslessness.
 * Pure functions on bytes; they never throw and return undefined / false on unreadable input.
 */

export interface Dimensions {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const u32le = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

const tag = (b: Uint8Array, o: number, text: string) =>
  b.length >= o + text.length && Array.from(text).every((c, i) => b[o + i] === c.charCodeAt(0));

const valid = (width: number, height: number): Dimensions | undefined =>
  width > 0 && height > 0 ? { width, height } : undefined;

export function readDimensions(format: string, bytes: Uint8Array): Dimensions | undefined {
  switch (format) {
    case "jpeg":
      return jpegDimensions(bytes);
    case "png":
      return pngDimensions(bytes);
    case "webp":
      return webpDimensions(bytes);
    case "avif":
      return avifDimensions(bytes);
    default:
      return undefined;
  }
}

export function isAnimated(format: string, bytes: Uint8Array): boolean {
  switch (format) {
    case "png":
      return isApng(bytes);
    case "webp":
      return isAnimatedWebp(bytes);
    case "avif":
      return tag(bytes, 8, "avis");
    default:
      return false;
  }
}

/** True when the WebP bitstream is VP8L (lossless). */
export function isLosslessWebp(bytes: Uint8Array): boolean {
  for (const chunk of webpChunks(bytes)) {
    if (chunk.type === "VP8L") return true;
    if (chunk.type === "VP8 ") return false;
  }
  return false;
}

// JPEG: first SOFn marker (0xC0-0xCF except DHT 0xC4, JPG 0xC8, DAC 0xCC).
function jpegDimensions(b: Uint8Array): Dimensions | undefined {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return undefined;
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) {
      o++;
      continue;
    }
    const marker = b[o + 1];
    if (marker === 0xff) {
      o++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2;
      continue;
    }
    const length = u16be(b, o + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (o + 9 > b.length) return undefined;
      return valid(u16be(b, o + 7), u16be(b, o + 5));
    }
    if (marker === 0xda || length < 2) return undefined; // start of scan: no SOF found before pixel data
    o += 2 + length;
  }
  return undefined;
}

// PNG: IHDR is the first chunk, width and height at offsets 16 and 20.
function pngDimensions(b: Uint8Array): Dimensions | undefined {
  if (b.length < 24 || !tag(b, 12, "IHDR")) return undefined;
  return valid(u32be(b, 16), u32be(b, 20));
}

function* webpChunks(b: Uint8Array): Generator<{ type: string; offset: number; size: number }> {
  if (b.length < 12 || !tag(b, 0, "RIFF") || !tag(b, 8, "WEBP")) return;
  let o = 12;
  while (o + 8 <= b.length) {
    const size = u32le(b, o + 4);
    yield { type: String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]), offset: o + 8, size };
    o += 8 + size + (size % 2);
  }
}

function webpDimensions(b: Uint8Array): Dimensions | undefined {
  for (const { type, offset } of webpChunks(b)) {
    if (type === "VP8X" && offset + 10 <= b.length) {
      return valid(u24le(b, offset + 4) + 1, u24le(b, offset + 7) + 1);
    }
    if (type === "VP8 " && offset + 10 <= b.length && b[offset + 3] === 0x9d && b[offset + 4] === 0x01 && b[offset + 5] === 0x2a) {
      return valid(((b[offset + 7] << 8) | b[offset + 6]) & 0x3fff, ((b[offset + 9] << 8) | b[offset + 8]) & 0x3fff);
    }
    if (type === "VP8L" && offset + 5 <= b.length && b[offset] === 0x2f) {
      const bits = u32le(b, offset + 1);
      return valid((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
  }
  return undefined;
}

function isAnimatedWebp(b: Uint8Array): boolean {
  for (const { type, offset } of webpChunks(b)) {
    if (type === "ANIM" || type === "ANMF") return true;
    if (type === "VP8X" && offset < b.length && (b[offset] & 0x02) !== 0) return true;
    if (type === "VP8 " || type === "VP8L") return false;
  }
  return false;
}

// APNG: an acTL chunk before the first IDAT.
function isApng(b: Uint8Array): boolean {
  let o = 8;
  while (o + 8 <= b.length) {
    if (tag(b, o + 4, "acTL")) return true;
    if (tag(b, o + 4, "IDAT")) return false;
    o += 12 + u32be(b, o);
  }
  return false;
}

// AVIF (ISO BMFF): `ispe` item property box = size, "ispe", version/flags, width, height.
// Several may exist (grid tiles, alpha plane): the largest one is the image.
function avifDimensions(b: Uint8Array): Dimensions | undefined {
  let best: Dimensions | undefined;
  for (let o = 4; o + 16 <= b.length; o++) {
    if (b[o] === 0x69 && tag(b, o, "ispe")) {
      const found = valid(u32be(b, o + 8), u32be(b, o + 12));
      if (found && (!best || found.width * found.height > best.width * best.height)) best = found;
    }
  }
  return best;
}
