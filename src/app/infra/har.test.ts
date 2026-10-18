import { describe, expect, it } from "vitest";
import { toNetworkRequest } from "./har";

function entry(overrides: any = {}): HARFormatEntry {
  return {
    request: { method: "GET", url: "https://example.org/a.css", ...overrides.request },
    response: {
      status: 200,
      headers: [],
      bodySize: 100,
      headersSize: 50,
      content: { size: 400, mimeType: "text/css" },
      ...overrides.response,
    },
  } as unknown as HARFormatEntry;
}

describe("toNetworkRequest", () => {
  it("maps a Chrome entry using _transferSize", () => {
    const r = toNetworkRequest(entry({ response: { _transferSize: 123 } }));
    expect(r).toEqual({
      method: "GET",
      url: new URL("https://example.org/a.css"),
      code: 200,
      type: "text/css",
      responseSize: 400,
      transferSize: 123,
      responseHeaders: {},
    });
  });

  it("falls back to body + headers sizes without _transferSize", () => {
    expect(toNetworkRequest(entry())?.transferSize).toBe(150);
  });

  it("clamps negative sizes to 0 in the fallback", () => {
    const r = toNetworkRequest(entry({ response: { bodySize: -1, headersSize: 70 } }));
    expect(r?.transferSize).toBe(70);
    const r2 = toNetworkRequest(entry({ response: { bodySize: -1, headersSize: -1 } }));
    expect(r2?.transferSize).toBe(0);
  });

  it("ignores a negative _transferSize", () => {
    expect(toNetworkRequest(entry({ response: { _transferSize: -1 } }))?.transferSize).toBe(150);
  });

  it("returns null for non-http(s) URLs", () => {
    for (const url of ["data:text/plain;base64,AAA", "blob:https://a/b", "chrome-extension://x/y", "moz-extension://x/y"]) {
      expect(toNetworkRequest(entry({ request: { url } }))).toBeNull();
    }
  });

  it("strips MIME parameters and defaults to empty string", () => {
    const r = toNetworkRequest(entry({ response: { content: { size: 1, mimeType: "text/html; charset=utf-8" } } }));
    expect(r?.type).toBe("text/html");
    const r2 = toNetworkRequest(entry({ response: { content: { size: 1 } } }));
    expect(r2?.type).toBe("");
  });

  it("defaults responseSize to 0", () => {
    const r = toNetworkRequest(entry({ response: { content: { mimeType: "a/b" } } }));
    expect(r?.responseSize).toBe(0);
  });

  it("lower-cases header names and joins duplicates", () => {
    const r = toNetworkRequest(
      entry({
        response: {
          headers: [
            { name: "Cache-Control", value: "max-age=1" },
            { name: "Set-Cookie", value: "a=1" },
            { name: "set-cookie", value: "b=2" },
          ],
        },
      })
    );
    expect(r?.responseHeaders).toEqual({ "cache-control": "max-age=1", "set-cookie": "a=1, b=2" });
  });
});
