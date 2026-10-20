import { describe, expect, it } from "vitest";
import { normaliseHttpVersion, toNetworkRequest } from "./har";

function entry(overrides: any = {}): HARFormatEntry {
  return {
    ...(overrides.startedDateTime !== undefined && { startedDateTime: overrides.startedDateTime }),
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

describe("normaliseHttpVersion (US-012 scenario 5)", () => {
  it.each([
    ["HTTP/1.0", "1.0"],
    ["http/1.0", "1.0"],
    ["HTTP/1.1", "1.1"],
    ["http/1.1", "1.1"],
    ["HTTP/2", "2"],
    ["HTTP/2.0", "2"],
    ["http/2.0", "2"],
    ["h2", "2"],
    ["h2c", "2"],
    ["HTTP/3", "3"],
    ["h3", "3"],
    ["h3-29", "3"],
    ["h3-Q050", "3"],
    ["  H2  ", "2"],
    ["", undefined],
    ["unknown", undefined],
    ["spdy/3.1", undefined],
    [undefined, undefined],
    [null, undefined],
    [2, undefined],
  ])("%j -> %j", (raw, expected) => {
    expect(normaliseHttpVersion(raw)).toBe(expected);
  });
});

describe("toNetworkRequest httpVersion and startedAt (ARCH-DECISION-019)", () => {
  it("normalises a Chrome-like entry: http/2.0, _transferSize, lower-case headers", () => {
    const r = toNetworkRequest(
      entry({
        startedDateTime: "2026-10-20T10:00:00.500Z",
        response: {
          httpVersion: "http/2.0",
          _transferSize: 321,
          headers: [{ name: "content-encoding", value: "br" }],
        },
      })
    );
    expect(r?.httpVersion).toBe("2");
    expect(r?.startedAt).toBe(Date.parse("2026-10-20T10:00:00.500Z"));
    expect(r?.transferSize).toBe(321);
    expect(r?.responseHeaders).toEqual({ "content-encoding": "br" });
  });

  it("normalises h3 from Chrome", () => {
    expect(toNetworkRequest(entry({ response: { httpVersion: "h3" } }))?.httpVersion).toBe("3");
  });

  it("normalises a Firefox-like entry: HTTP/2, mixed-case Content-Encoding, no _transferSize", () => {
    const r = toNetworkRequest(
      entry({
        startedDateTime: "2026-10-20T10:00:01.000+02:00",
        response: {
          httpVersion: "HTTP/2",
          headers: [
            { name: "Content-Encoding", value: "GZIP" },
            { name: "Cache-Control", value: "max-age=60" },
          ],
        },
      })
    );
    // US-008: Firefox exposes content-encoding; the name is lower-cased, the value is kept as is.
    expect(r?.responseHeaders?.["content-encoding"]).toBe("GZIP");
    expect(r?.responseHeaders).not.toHaveProperty("Content-Encoding");
    expect(r?.httpVersion).toBe("2");
    expect(r?.transferSize).toBe(150);
    expect(r?.startedAt).toBe(Date.parse("2026-10-20T08:00:01.000Z"));
    expect(
      toNetworkRequest(entry({ response: { httpVersion: "HTTP/1.1" } }))?.httpVersion
    ).toBe("1.1");
  });

  it("omits both keys when unknown or unparseable", () => {
    const r = toNetworkRequest(
      entry({ startedDateTime: "not a date", response: { httpVersion: "unknown" } })
    )!;
    expect("httpVersion" in r).toBe(false);
    expect("startedAt" in r).toBe(false);
    const none = toNetworkRequest(entry())!;
    expect(Object.keys(none)).not.toContain("httpVersion");
    expect(Object.keys(none)).not.toContain("startedAt");
  });
});
