import { describe, expect, it } from "vitest";
import { NetworkRequest } from "../models/network-request";
import {
  findImageRequest,
  formatFromMime,
  isTransferred,
  normaliseImageUrl,
  originalBytesOf,
} from "./image-requests";

const req = (o: Partial<Omit<NetworkRequest, "url">> & { url: string }): NetworkRequest => ({
  method: "GET",
  code: 200,
  type: "image/jpeg",
  responseSize: 1000,
  transferSize: 1200,
  ...o,
  url: new URL(o.url),
});

describe("normaliseImageUrl", () => {
  it("drops the fragment and keeps the query", () => {
    expect(normaliseImageUrl("https://x.test/a.jpg?v=2#frag")).toBe("https://x.test/a.jpg?v=2");
  });
  it("returns unparseable input unchanged", () => {
    expect(normaliseImageUrl("not a url")).toBe("not a url");
  });
});

describe("findImageRequest", () => {
  it("matches by URL without fragment and prefers the last successful request", () => {
    const first = req({ url: "https://x.test/a.jpg", transferSize: 10 });
    const last = req({ url: "https://x.test/a.jpg#x", transferSize: 20 });
    const other = req({ url: "https://x.test/b.jpg" });
    expect(findImageRequest([first, last, other], "https://x.test/a.jpg")).toBe(last);
  });
  it("ignores failed responses but accepts 304", () => {
    const ok = req({ url: "https://x.test/a.jpg", code: 304 });
    const ko = req({ url: "https://x.test/a.jpg", code: 404 });
    expect(findImageRequest([ok, ko], "https://x.test/a.jpg")).toBe(ok);
    expect(findImageRequest([ko], "https://x.test/a.jpg")).toBeUndefined();
  });
  it("returns undefined when nothing matches", () => {
    expect(findImageRequest([], "https://x.test/a.jpg")).toBeUndefined();
  });
});

describe("originalBytesOf", () => {
  it("uses the transfer size of a 2xx response", () => {
    expect(originalBytesOf(req({ url: "https://x.test/a", transferSize: 240_000 }))).toBe(240_000);
  });
  it("falls back to the body size when served from cache or revalidated (transfer 0 or 304)", () => {
    expect(originalBytesOf(req({ url: "https://x.test/a", transferSize: 0, responseSize: 5000 }))).toBe(5000);
    expect(originalBytesOf(req({ url: "https://x.test/a", code: 304, transferSize: 300, responseSize: 5000 }))).toBe(5000);
  });
  it("falls back to the source bytes of an estimation, else undefined", () => {
    expect(originalBytesOf(req({ url: "https://x.test/a", transferSize: 0, responseSize: 0 }), 777)).toBe(777);
    expect(originalBytesOf(undefined, 777)).toBe(777);
    expect(originalBytesOf(undefined)).toBeUndefined();
  });
});

describe("isTransferred", () => {
  it("is true only for a 2xx response with bytes on the wire", () => {
    expect(isTransferred(req({ url: "https://x.test/a", transferSize: 10 }))).toBe(true);
    expect(isTransferred(req({ url: "https://x.test/a", transferSize: 0 }))).toBe(false);
    expect(isTransferred(req({ url: "https://x.test/a", code: 304 }))).toBe(false);
    expect(isTransferred(undefined)).toBe(false);
  });
});

describe("formatFromMime", () => {
  it("maps known image MIME types, case-insensitively", () => {
    expect(formatFromMime("image/jpeg")).toBe("jpeg");
    expect(formatFromMime("IMAGE/PNG")).toBe("png");
    expect(formatFromMime("image/webp")).toBe("webp");
    expect(formatFromMime("image/svg+xml")).toBe("svg");
  });
  it("returns 'generic' for missing or generic types", () => {
    expect(formatFromMime("")).toBe("generic");
    expect(formatFromMime("application/octet-stream")).toBe("generic");
  });
  it("returns undefined for non-image types and unknown image types", () => {
    expect(formatFromMime("text/html")).toBeUndefined();
    expect(formatFromMime("image/x-unknown")).toBe("unknown");
  });
});
