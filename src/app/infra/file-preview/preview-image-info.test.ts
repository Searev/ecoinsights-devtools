import { describe, expect, it } from "vitest";
import { describePreviewImage } from "./preview-image-info";

const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const i32le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const bytes = (...parts: number[][]) => Uint8Array.from(parts.flat());
const text = (s: string) => new TextEncoder().encode(s);

// GIF building blocks.
const gifHeader = (w: number, h: number, globalTable = false) =>
  [...ascii("GIF89a"), ...u16le(w), ...u16le(h), globalTable ? 0x80 : 0, 0, 0, ...(globalTable ? [1, 2, 3, 4, 5, 6] : [])];
const gifFrame = (localTable = false) => [
  0x2c, 0, 0, 0, 0, 1, 0, 1, 0, localTable ? 0x80 : 0,
  ...(localTable ? [9, 9, 9, 8, 8, 8] : []),
  2, 3, 1, 2, 3, 0,
];
const gifExtension = [0x21, 0xf9, 4, 0, 0, 0, 0, 0];

describe("describePreviewImage", () => {
  describe("gif", () => {
    it("reads the logical screen size of a static GIF", () => {
      const file = bytes(gifHeader(120, 80), gifFrame(), [0x3b]);
      expect(describePreviewImage(file, "image/gif")).toEqual({
        format: "gif", animated: false, vector: false, width: 120, height: 80, byteLength: file.length, mimeType: "image/gif",
      });
    });

    it("detects an animated GIF with extensions, a global and a local colour table", () => {
      const file = bytes(gifHeader(10, 10, true), gifExtension, gifFrame(true), gifExtension, gifFrame(), [0x3b]);
      const info = describePreviewImage(file, "");
      expect(info).toMatchObject({ format: "gif", animated: true, width: 10, height: 10, byteLength: file.length });
    });

    it("counts the frames found in a truncated GIF", () => {
      const full = bytes(gifHeader(10, 10), gifFrame(), gifFrame(), [0x3b]);
      expect(describePreviewImage(full.subarray(0, full.length - 8), "image/gif")?.animated).toBe(true);
      const oneAndAHalf = bytes(gifHeader(10, 10), gifFrame(), gifFrame().slice(0, 6));
      expect(describePreviewImage(oneAndAHalf, "image/gif")?.animated).toBe(true);
      expect(describePreviewImage(bytes(gifHeader(10, 10), gifFrame().slice(0, 6)), "image/gif")?.animated).toBe(false);
    });
  });

  describe("bmp", () => {
    const bmp = (headerSize: number, dims: number[]) => bytes(ascii("BM"), new Array(12).fill(0), i32le(headerSize), dims, new Array(20).fill(0));
    it("reads BITMAPINFOHEADER with a positive height", () => {
      expect(describePreviewImage(bmp(40, [...i32le(30), ...i32le(20)]), "")).toMatchObject({ format: "bmp", width: 30, height: 20, mimeType: "image/bmp" });
    });
    it("uses the absolute value of a negative (top-down) height", () => {
      expect(describePreviewImage(bmp(40, [...i32le(30), ...i32le(-20)]), "")).toMatchObject({ width: 30, height: 20 });
    });
    it("reads BITMAPCOREHEADER", () => {
      expect(describePreviewImage(bmp(12, [...u16le(64), ...u16le(48)]), "")).toMatchObject({ width: 64, height: 48 });
    });
  });

  describe("ico", () => {
    const entry = (w: number, h: number) => [w, h, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    it("picks the entry of largest area, 0 meaning 256", () => {
      const file = bytes([0, 0, 1, 0], u16le(3), entry(16, 16), entry(0, 0), entry(48, 48));
      expect(describePreviewImage(file, "")).toMatchObject({ format: "ico", width: 256, height: 256, mimeType: "image/x-icon" });
    });
    it("handles a single entry", () => {
      expect(describePreviewImage(bytes([0, 0, 1, 0], u16le(1), entry(32, 16)), "")).toMatchObject({ width: 32, height: 16 });
    });
  });

  describe("svg", () => {
    const svg = (s: string) => describePreviewImage(text(s), "image/svg+xml");
    it("reads plain width and height", () => {
      expect(svg('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"></svg>')).toMatchObject({ format: "svg", vector: true, animated: false, width: 100, height: 50, mimeType: "image/svg+xml" });
    });
    it("accepts px units and single quotes", () => {
      expect(svg("<svg width='100px' height='50.5px'/>")).toMatchObject({ width: 100, height: 50.5 });
    });
    it("gives no size for percentages, em or missing attributes", () => {
      for (const s of ['<svg width="100%" height="50%"/>', '<svg width="2em" height="1em"/>', '<svg viewBox="0 0 10 10"/>', '<svg width="10"/>']) {
        const info = svg(s);
        expect(info).toMatchObject({ vector: true });
        expect(info?.width).toBeUndefined();
        expect(info?.height).toBeUndefined();
      }
    });
    it("gives no size for zero or negative values", () => {
      expect(svg('<svg width="0" height="10"/>')?.width).toBeUndefined();
      expect(svg('<svg width="-5" height="10"/>')?.width).toBeUndefined();
    });
    it("skips the XML declaration, comments and doctype before the root", () => {
      const file = '<?xml version="1.0"?>\n<!-- <svg width="1" height="1"> -->\n<!DOCTYPE svg PUBLIC "x" "y">\n<svg width="7" height="9"></svg>';
      expect(svg(file)).toMatchObject({ width: 7, height: 9 });
    });
    it("does not take width from a child element", () => {
      expect(svg('<svg viewBox="0 0 1 1"><rect width="5" height="5"/></svg>')?.width).toBeUndefined();
    });
    it("is an image whatever the MIME type when the signature matches", () => {
      expect(describePreviewImage(text('<svg width="1" height="1"/>'), "text/plain")?.format).toBe("svg");
    });
  });

  describe("raster headers through readDimensions", () => {
    it("reads PNG", () => {
      const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], u32be(13), ascii("IHDR"), u32be(300), u32be(200), new Array(5).fill(0));
      expect(describePreviewImage(png, "")).toMatchObject({ format: "png", animated: false, vector: false, width: 300, height: 200, mimeType: "image/png" });
    });
    it("reads JPEG", () => {
      const jpg = bytes([0xff, 0xd8], [0xff, 0xc0, 0, 17, 8, 0x01, 0x90, 0x03, 0x20, 3, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(describePreviewImage(jpg, "")).toMatchObject({ format: "jpeg", width: 800, height: 400, mimeType: "image/jpeg" });
    });
    it("has an undefined size for a truncated header", () => {
      const info = describePreviewImage(bytes([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg");
      expect(info?.format).toBe("jpeg");
      expect(info?.width).toBeUndefined();
    });
  });

  describe("format resolution", () => {
    it("falls back to the MIME type when no signature matches", () => {
      const info = describePreviewImage(bytes([1, 2, 3, 4]), "image/webp");
      expect(info).toMatchObject({ format: "webp", mimeType: "image/webp", byteLength: 4 });
    });
    it("treats an unknown image/* type as an image of unknown format", () => {
      expect(describePreviewImage(bytes([1, 2, 3, 4]), "image/x-foo")).toEqual({ format: "unknown", animated: false, vector: false, byteLength: 4, mimeType: "image/x-foo" });
    });
    it("maps TIFF to unknown", () => {
      expect(describePreviewImage(bytes([0x49, 0x49, 0x2a, 0, 0, 0, 0, 0]), "image/tiff")).toMatchObject({ format: "unknown", mimeType: "image/tiff" });
    });
    it("is not an image without signature and with a non-image MIME type", () => {
      expect(describePreviewImage(text("<html></html>"), "text/html")).toBeUndefined();
      expect(describePreviewImage(bytes([1, 2, 3]), "")).toBeUndefined();
    });
  });
});
