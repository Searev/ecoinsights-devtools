import { describe, expect, it } from "vitest";
import { COMPARISON_CACHE_MAX_BYTES } from "../image-estimation/policy";
import { createSessionFileCache } from "./session-file-cache";

describe("createSessionFileCache", () => {
  it("sizes entries by their byte length", () => {
    const cache = createSessionFileCache(100);
    cache.set("a", { bytes: new Uint8Array(40) });
    cache.set("b", { bytes: new Uint8Array(50) });
    expect(cache.totalBytes()).toBe(90);
    cache.set("c", { bytes: new Uint8Array(20) });
    expect(cache.has("a")).toBe(false);
    expect(cache.totalBytes()).toBe(70);
  });

  it("defaults to the comparison cap (50 MB)", () => {
    const cache = createSessionFileCache();
    cache.set("big", { bytes: new Uint8Array(COMPARISON_CACHE_MAX_BYTES) });
    expect(cache.has("big")).toBe(true);
    cache.set("more", { bytes: new Uint8Array(1) });
    expect(cache.has("big")).toBe(false);
  });
});
