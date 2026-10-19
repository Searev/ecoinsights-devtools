/** Test helpers: deterministic synthetic images and hand-made file headers. */
import type { Codecs, RawImage } from "../codecs";

/** Smooth gradient plus deterministic noise, opaque unless `alpha` is set. */
export function makeRawImage(width: number, height: number, alpha = false): RawImage {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 12345;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed >> 16) % 32;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = ((x * 255) / width + noise()) % 256;
      data[i + 1] = ((y * 255) / height + noise()) % 256;
      data[i + 2] = (((x + y) * 127) / (width + height) + noise()) % 256;
      data[i + 3] = alpha ? 128 + (x % 64) : 255;
    }
  }
  return { data, width, height };
}

export const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
export const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
export const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function pngChunk(type: string, body: number[] = []): number[] {
  return [...u32be(body.length), ...ascii(type), ...body, 0, 0, 0, 0]; // CRC not checked
}

/** A PNG made only of its signature, an IHDR declaring `width`×`height`, and optional extra chunks. */
export function pngHeader(width: number, height: number, extraChunks: number[][] = []): Uint8Array {
  const ihdr = pngChunk("IHDR", [...u32be(width), ...u32be(height), 8, 6, 0, 0, 0]);
  return new Uint8Array([...PNG_SIGNATURE, ...ihdr, ...extraChunks.flat()]);
}

/** Minimal RIFF/WebP container made of the given chunks (no valid payload). */
export function webpContainer(chunks: { type: string; body: number[] }[]): Uint8Array {
  const body = chunks.flatMap(({ type, body }) => [
    ...ascii(type),
    ...u32le(body.length),
    ...body,
    ...(body.length % 2 ? [0] : []),
  ]);
  return new Uint8Array([...ascii("RIFF"), ...u32le(body.length + 4), ...ascii("WEBP"), ...body]);
}

export function webpVp8x(flags: number, width: number, height: number) {
  const w = width - 1;
  const h = height - 1;
  return {
    type: "VP8X",
    body: [flags, 0, 0, 0, w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255],
  };
}

export const gifBytes = () => new Uint8Array([...ascii("GIF89a"), 1, 0, 1, 0, 0, 0, 0, 0x3b]);
export const icoBytes = () => new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0]);
export const htmlBytes = () => new TextEncoder().encode("<!doctype html><html><body>404</body></html>");

export const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** Real-codec encodings of a synthetic image, used as pipeline inputs. */
export async function sampleFiles(codecs: Codecs, width = 96, height = 64) {
  const raw = makeRawImage(width, height);
  const rgba = makeRawImage(width, height, true);
  return {
    raw,
    jpeg: await codecs.encode(raw, { format: "jpeg", quality: 95 }),
    png: await codecs.encode(rgba, { format: "png", level: 2 }),
    webpLossy: await codecs.encode(raw, { format: "webp", lossless: false, quality: 90 }),
    webpLossless: await codecs.encode(raw, { format: "webp", lossless: true }),
    avif: await codecs.encode(raw, { format: "avif", quality: 60, speed: 8 }),
  };
}
