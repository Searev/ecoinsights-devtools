import { describe, expect, it } from "vitest";
import { detectImageFormat, sniffImageFormat } from "./signature";

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8 "));
const AVIF = bytes(0, 0, 0, 0x20, ...ascii("ftypavif"));
const AVIS = bytes(0, 0, 0, 0x20, ...ascii("ftypavis"));
const HEIC = bytes(0, 0, 0, 0x20, ...ascii("ftypheic"));
const GIF = bytes(...ascii("GIF89a"));
const BMP = bytes(...ascii("BM"), 0, 0);
const ICO = bytes(0, 0, 1, 0, 1, 0);
const TIFF = bytes(0x49, 0x49, 0x2a, 0);
const SVG = bytes(...ascii('<?xml version="1.0"?><svg'));

describe("sniffImageFormat", () => {
  it.each([
    ["jpeg", JPEG],
    ["png", PNG],
    ["webp", WEBP],
    ["avif", AVIF],
    ["avif", AVIS],
    ["gif", GIF],
    ["bmp", BMP],
    ["ico", ICO],
    ["tiff", TIFF],
    ["svg", SVG],
  ] as const)("detects %s", (format, head) => {
    expect(sniffImageFormat(head)).toBe(format);
  });

  it("returns unknown for other or too short content", () => {
    expect(sniffImageFormat(HEIC)).toBe("unknown");
    expect(sniffImageFormat(bytes(...ascii("<html>")))).toBe("unknown");
    expect(sniffImageFormat(bytes(0xff))).toBe("unknown");
    expect(sniffImageFormat(bytes())).toBe("unknown");
  });
});

describe("detectImageFormat", () => {
  it("trusts a specific image MIME type over the signature (US-002 scenario 5)", () => {
    expect(detectImageFormat("image/webp", JPEG)).toBe("webp");
  });
  it("uses the signature for generic MIME types (US-002 scenario 6)", () => {
    expect(detectImageFormat("application/octet-stream", PNG)).toBe("png");
    expect(detectImageFormat("", JPEG)).toBe("jpeg");
  });
  it("uses the signature for unknown image types", () => {
    expect(detectImageFormat("image/x-whatever", PNG)).toBe("png");
  });
  it("returns unknown for non-image MIME types without a known signature", () => {
    expect(detectImageFormat("text/html", bytes(...ascii("<html>")))).toBe("unknown");
  });
});
