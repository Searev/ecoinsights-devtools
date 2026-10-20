import { describe, expect, it } from "vitest";
import { detectFontFormat } from "./font-format";

const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
const pad = (head: number[], length = 64) => Uint8Array.from([...head, ...new Array(Math.max(0, length - head.length)).fill(0)]);

describe("detectFontFormat", () => {
  it.each([
    ["wOF2", ascii("wOF2"), "woff2"],
    ["wOFF", ascii("wOFF"), "woff"],
    ["OTTO", ascii("OTTO"), "otf"],
    ["00 01 00 00", [0, 1, 0, 0], "ttf"],
    ["true", ascii("true"), "ttf"],
  ])("detects %s from the signature", (_n, head, expected) => {
    expect(detectFontFormat(pad(head), "", "")).toBe(expected);
  });

  it("detects EOT from bytes 34-35 when at least 36 bytes are available", () => {
    const head = pad([], 64);
    head[34] = 0x4c;
    head[35] = 0x50;
    expect(detectFontFormat(head, "", "")).toBe("eot");
    expect(detectFontFormat(head.subarray(0, 35), "", "")).toBe("unknown");
  });

  it("prefers the signature over the MIME type and the extension", () => {
    expect(detectFontFormat(pad(ascii("wOF2")), "font/woff", "https://a.test/f.ttf")).toBe("woff2");
  });

  it.each([
    ["font/woff2", "woff2"],
    ["application/font-woff2", "woff2"],
    ["font/woff", "woff"],
    ["application/font-woff", "woff"],
    ["application/x-font-woff", "woff"],
    ["font/ttf", "ttf"],
    ["application/x-font-ttf", "ttf"],
    ["application/x-font-truetype", "ttf"],
    ["font/sfnt", "ttf"],
    ["application/font-sfnt", "ttf"],
    ["font/otf", "otf"],
    ["application/x-font-opentype", "otf"],
    ["application/font-otf", "otf"],
    ["application/vnd.ms-fontobject", "eot"],
    ["Font/WOFF2", "woff2"],
  ])("maps the MIME type %s to %s", (mime, expected) => {
    expect(detectFontFormat(new Uint8Array(0), mime, "")).toBe(expected);
  });

  it.each(["woff2", "woff", "ttf", "otf", "eot"])("falls back to the .%s extension", (ext) => {
    expect(detectFontFormat(new Uint8Array(0), "application/octet-stream", `https://a.test/f.${ext}?v=1#x`)).toBe(ext);
  });

  it("returns unknown otherwise", () => {
    expect(detectFontFormat(new Uint8Array(0), "text/html", "https://a.test/f.html")).toBe("unknown");
    expect(detectFontFormat(new Uint8Array(0), "", "not a url")).toBe("unknown");
  });
});
