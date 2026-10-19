import { describe, expect, it, vi } from "vitest";
import { MAX_IMAGE_BYTES } from "../../domain/image-estimation/policy";
import { createImageBytesSource } from "./image-bytes-source";

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1];
const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

function neverFetch() {
  return vi.fn(async () => {
    throw new Error("fetch must not be called");
  });
}

describe("createImageBytesSource", () => {
  it("uses base64 DevTools content and does not call fetch", async () => {
    const fetch = neverFetch();
    const data = b64(JPEG_HEAD);
    const source = createImageBytesSource({
      getDevtoolsContent: async () => ({ content: data, encoding: "base64" }),
      fetch,
    });
    expect(await source("https://x.test/a.jpg")).toEqual({
      ok: true,
      source: { kind: "base64", data },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts Firefox-style content without encoding when it has an image signature", async () => {
    const fetch = neverFetch();
    const data = b64(JPEG_HEAD);
    const source = createImageBytesSource({
      getDevtoolsContent: async () => ({ content: data }),
      fetch,
    });
    expect(await source("https://x.test/a.jpg")).toEqual({
      ok: true,
      source: { kind: "base64", data },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to fetch when content without encoding is not an image (text body)", async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const source = createImageBytesSource({
      getDevtoolsContent: async () => ({ content: "<html>not an image!</html>" }),
      fetch,
    });
    const result = await source("https://x.test/a.jpg");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });

  it("fetches with force-cache when DevTools has no content", async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const source = createImageBytesSource({ getDevtoolsContent: async () => null, fetch });
    const result = await source("https://x.test/a.jpg");
    expect(fetch).toHaveBeenCalledWith("https://x.test/a.jpg", {
      cache: "force-cache",
      credentials: "include",
    });
    expect(result.ok && result.source.kind).toBe("binary");
    if (result.ok && result.source.kind === "binary") {
      expect(Array.from(new Uint8Array(result.source.data))).toEqual([1, 2, 3]);
    }
  });

  it("fetches when no getDevtoolsContent is provided or it throws", async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([9])));
    expect((await createImageBytesSource({ fetch })("https://x.test/a")).ok).toBe(true);
    const throwing = createImageBytesSource({
      getDevtoolsContent: async () => {
        throw new Error("boom");
      },
      fetch,
    });
    expect((await throwing("https://x.test/a")).ok).toBe(true);
  });

  it("returns failed(bytes-unavailable) on 404", async () => {
    const source = createImageBytesSource({
      fetch: async () => new Response("nope", { status: 404 }),
    });
    expect(await source("https://x.test/a.jpg")).toEqual({
      ok: false,
      outcome: { status: "failed", reason: "bytes-unavailable", message: expect.any(String) },
    });
  });

  it("returns failed(bytes-unavailable) on network error", async () => {
    const source = createImageBytesSource({
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const result = await source("https://x.test/a.jpg");
    expect(result).toMatchObject({
      ok: false,
      outcome: { status: "failed", reason: "bytes-unavailable" },
    });
  });

  it("returns skipped(too-large) for a 12 MB Content-Length without reading the body", async () => {
    const response = new Response(new Uint8Array([1]), {
      headers: { "content-length": "12000000" },
    });
    const arrayBuffer = vi.spyOn(response, "arrayBuffer");
    const source = createImageBytesSource({ fetch: async () => response });
    expect(await source("https://x.test/a.jpg")).toEqual({
      ok: false,
      outcome: { status: "skipped", reason: "too-large" },
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("returns skipped(too-large) when the body exceeds the limit without Content-Length", async () => {
    const response = new Response(new Uint8Array(MAX_IMAGE_BYTES + 1));
    const source = createImageBytesSource({ fetch: async () => response });
    expect(await source("https://x.test/a.jpg")).toEqual({
      ok: false,
      outcome: { status: "skipped", reason: "too-large" },
    });
  });
});
