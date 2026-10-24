import { describe, expect, it } from "vitest";
import { NetworkRequest } from "../../models/network-request";
import {
  contentTypeCharset,
  hostOf,
  isDeclaredMinified,
  isGenericMime,
  isSuccess2xx,
  lastRequestPerUrl,
  pathExtension,
  textFileType,
} from "./request-helpers";

const req = (url: string, o: Partial<NetworkRequest> = {}): NetworkRequest => ({
  method: "GET",
  url: new URL(url),
  code: 200,
  type: "",
  responseSize: 0,
  transferSize: 0,
  ...o,
});

describe("isSuccess2xx", () => {
  it.each([
    [200, true],
    [204, true],
    [299, true],
    [304, false],
    [404, false],
    [0, false],
  ])("%i → %s", (code, expected) => {
    expect(isSuccess2xx(req("https://x.test/", { code }))).toBe(expected);
  });
});

describe("isGenericMime", () => {
  it.each([
    ["", true],
    ["application/octet-stream", true],
    ["binary/octet-stream", true],
    ["text/css", false],
    ["image/gif", false],
  ])("%j → %s", (type, expected) => {
    expect(isGenericMime(type)).toBe(expected);
  });
});

describe("pathExtension", () => {
  it.each([
    ["https://x.test/a/b.JS?x=1.css#f.svg", "js"],
    ["https://x.test/a/archive.tar.gz", "gz"],
    ["https://x.test/fonts/roboto?family=Roboto", undefined],
    ["https://x.test/", undefined],
    ["https://x.test/.hidden", "hidden"],
    ["https://x.test/dir.v2/file", undefined],
  ])("%s → %s", (url, expected) => {
    expect(pathExtension(new URL(url))).toBe(expected);
  });
});

describe("isDeclaredMinified (US-021)", () => {
  it.each([
    ["https://x.test/js/jquery.min.js?ver=3.7.1", true],
    ["https://x.test/Bootstrap.MIN.CSS", true],
    ["https://x.test/app.min.mjs#x", true],
    ["https://x.test/app-min.js", false],
    ["https://x.test/app.minified.js", false],
    ["https://x.test/min.js", false],
    ["https://x.test/app.min.4f3a2c.js", false],
    ["https://x.test/icon.min.svg", false],
    ["https://x.test/dir.min.js/file.js", false],
    ["https://x.test/", false],
  ])("%s → %s", (url, expected) => {
    expect(isDeclaredMinified(new URL(url))).toBe(expected);
  });
});

describe("textFileType", () => {
  it.each([
    ["text/html", "https://x.test/", "HTML"],
    ["text/css", "https://x.test/a", "CSS"],
    ["text/javascript", "https://x.test/a", "JS"],
    ["application/javascript", "https://x.test/a", "JS"],
    ["application/x-javascript", "https://x.test/a", "JS"],
    ["application/ecmascript", "https://x.test/a", "JS"],
    ["image/svg+xml", "https://x.test/a", "SVG"],
    ["application/octet-stream", "https://x.test/assets/main.js", "JS"],
    ["", "https://x.test/m.mjs", "JS"],
    ["", "https://x.test/page.htm", "HTML"],
    ["", "https://x.test/page.HTML", "HTML"],
    ["", "https://x.test/s.css", "CSS"],
    ["", "https://x.test/i.svg", "SVG"],
  ])("%j %s → %s", (type, url, expected) => {
    expect(textFileType(req(url, { type }))).toBe(expected);
  });

  it.each([
    ["application/json", "https://x.test/a.js"],
    ["image/png", "https://x.test/a.svg"],
    ["", "https://x.test/data.json"],
    ["text/plain", "https://x.test/a.js"],
  ])("%j %s → undefined (a specific MIME type wins over the extension)", (type, url) => {
    expect(textFileType(req(url, { type }))).toBeUndefined();
  });
});

describe("hostOf", () => {
  it("lower-cases, ignores the port and removes the trailing dot", () => {
    expect(hostOf(new URL("https://CDN.Example.org:8443/a.js"))).toBe("cdn.example.org");
    expect(hostOf(new URL("https://cdn.example.org./b.js"))).toBe("cdn.example.org");
  });

  it("keeps IP addresses", () => {
    expect(hostOf(new URL("http://192.168.0.1:3000/"))).toBe("192.168.0.1");
    expect(hostOf(new URL("http://[::1]:3000/"))).toBe("[::1]");
  });
});

describe("contentTypeCharset", () => {
  it("reads the charset parameter, lower case", () => {
    expect(contentTypeCharset(req("https://x.test/", { responseHeaders: { "content-type": 'text/css; Charset="ISO-8859-1"' } }))).toBe("iso-8859-1");
  });

  it("is undefined without header or parameter", () => {
    expect(contentTypeCharset(req("https://x.test/"))).toBeUndefined();
    expect(contentTypeCharset(req("https://x.test/", { responseHeaders: { "content-type": "text/css" } }))).toBeUndefined();
  });
});

describe("lastRequestPerUrl", () => {
  it("keeps the last matching request per URL without fragment, in first-seen order", () => {
    const a1 = req("https://x.test/a.gif", { transferSize: 1 });
    const b = req("https://x.test/b.gif");
    const a2 = req("https://x.test/a.gif#x", { transferSize: 2 });
    const failed = req("https://x.test/a.gif", { code: 404 });
    const res = lastRequestPerUrl([a1, b, a2, failed], isSuccess2xx);
    expect([...res.keys()]).toEqual(["https://x.test/a.gif", "https://x.test/b.gif"]);
    expect(res.get("https://x.test/a.gif")).toBe(a2);
  });
});
