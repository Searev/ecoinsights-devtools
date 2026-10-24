import { describe, expect, it } from "vitest";
import { LineRef } from "../models/best-practice";
import { NetworkRequest } from "../models/network-request";
import { formatKo } from "../best-practices/rules/image-rule-helpers";
import { createPreviewSubjectResolver, isPreviewableUrl, legacyLinePreview } from "./preview-subject";

function request(url: string, patch: Partial<NetworkRequest> = {}): NetworkRequest {
  return {
    method: "GET",
    url: new URL(url),
    code: 200,
    type: "",
    responseSize: 0,
    transferSize: 0,
    ...patch,
  };
}

describe("isPreviewableUrl", () => {
  it("accepts http and https only (epic §1)", () => {
    expect(isPreviewableUrl("https://x.test/a.jpg")).toBe(true);
    expect(isPreviewableUrl("HTTP://x.test/a.jpg")).toBe(true);
    expect(isPreviewableUrl("blob:https://x.test/0f1e")).toBe(false);
    expect(isPreviewableUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isPreviewableUrl("ftp://x.test/a.jpg")).toBe(false);
    expect(isPreviewableUrl("not a url")).toBe(false);
  });
});

describe("legacyLinePreview (lines saved before EPIC-PV)", () => {
  it.each([
    ["LimitGifs", undefined, { kind: "image" }],
    ["UseLazyLoading", undefined, { kind: "image" }],
    ["UseLazyLoading", "Iframe ", { kind: "iframe" }],
    ["ProvideTextAlternatives", "Vidéo ", { kind: "video" }],
    ["AvoidMediaAutoplay", "Vidéo ", { kind: "video" }],
    ["AvoidMediaAutoplay", "Son ", { kind: "audio" }],
    ["UseStandardFonts", undefined, { kind: "font" }],
  ])("%s with prefix %j → %j", (ruleId, prefix, expected) => {
    expect(legacyLinePreview(ruleId, prefix)).toEqual(expected);
  });

  it("leaves unprefixed US-006 lines plain: an <img> cannot be told from an <area> link", () => {
    expect(legacyLinePreview("ProvideTextAlternatives", undefined)).toBeUndefined();
  });

  it("returns undefined for the other rules", () => {
    expect(legacyLinePreview("CompressTextFiles", undefined)).toBeUndefined();
    expect(legacyLinePreview("CompressTextFiles", undefined, "main.css (CSS, 48 ko) : non compressé")).toBeUndefined();
    expect(legacyLinePreview("MinifyTextFiles", undefined)).toBeUndefined();
    expect(legacyLinePreview("UseLazyLoading", "Vidéo ")).toBeUndefined();
  });
});

describe("legacyLinePreview for MinifyTextFiles (US-020 S12: refs saved before US-020)", () => {
  const ko = (bytes: number) => formatKo(bytes);

  it.each([
    ["CSS", `main.css (CSS, ${ko(48_000)}) : non minifié (~23 % d'octets superflus)`],
    ["JS", `app.js (JS, ${ko(1_234_000)}) : non minifié (~5 % d'octets superflus)`],
    ["HTML", `index.html (HTML, ${ko(12_000)}) : non minifié (~100 % d'octets superflus)`],
    ["SVG", `logo.svg (SVG, ${ko(12_000)}) : non minifié (~7 % d'octets superflus)`],
  ])("an offender line of type %s is a text preview of that type", (type, text) => {
    expect(legacyLinePreview("MinifyTextFiles", undefined, text)).toEqual({ kind: "text", type });
  });

  it("keeps a file name that itself looks like a line (the end of the text decides)", () => {
    const text = `a (CSS, 1 ko) : non minifié (~9 % d'octets superflus).js (JS, ${ko(2_000)}) : non minifié (~9 % d'octets superflus)`;
    expect(legacyLinePreview("MinifyTextFiles", undefined, text)).toEqual({ kind: "text", type: "JS" });
  });

  it("leaves 'non évalué' lines, prefixed refs and a missing text plain (US-020 S4)", () => {
    expect(
      legacyLinePreview("MinifyTextFiles", undefined, `big.js (JS, ${ko(6_000_000)}) : non évalué (fichier trop volumineux)`)
    ).toBeUndefined();
    expect(
      legacyLinePreview("MinifyTextFiles", "x ", `main.css (CSS, ${ko(48_000)}) : non minifié (~23 % d'octets superflus)`)
    ).toBeUndefined();
    expect(legacyLinePreview("MinifyTextFiles", undefined, undefined)).toBeUndefined();
  });
});

describe("createPreviewSubjectResolver", () => {
  it("builds an image subject with the recorded MIME type and the display box (US-015 S1)", () => {
    const resolve = createPreviewSubjectResolver([
      request("https://x.test/hero.jpg", { type: "image/jpeg", transferSize: 180_000 }),
    ]);
    const ref: LineRef = {
      url: "https://x.test/hero.jpg",
      preview: { kind: "image", display: { width: 600, height: 400 } },
    };
    expect(resolve("ProvideTextAlternatives", ref)).toEqual({
      kind: "image",
      url: "https://x.test/hero.jpg",
      ruleId: "ProvideTextAlternatives",
      declaredType: "image/jpeg",
      display: { width: 600, height: 400 },
    });
  });

  it("keeps a 0 × 0 box and omits an unknown one", () => {
    const resolve = createPreviewSubjectResolver([]);
    expect(
      resolve("LimitGifs", { url: "https://x.test/l.gif", preview: { kind: "image", display: { width: 0, height: 0 } } })
    ).toEqual({ kind: "image", url: "https://x.test/l.gif", ruleId: "LimitGifs", declaredType: "", display: { width: 0, height: 0 } });
    const subject = resolve("LimitGifs", { url: "https://x.test/l.gif", preview: { kind: "image" } });
    expect(subject).toEqual({ kind: "image", url: "https://x.test/l.gif", ruleId: "LimitGifs", declaredType: "" });
    expect(subject).not.toHaveProperty("display");
  });

  it("matches requests by URL without fragment and takes the last non-empty MIME type", () => {
    const resolve = createPreviewSubjectResolver([
      request("https://x.test/a.png#first", { type: "image/png" }),
      request("https://x.test/a.png", { type: "" }),
      request("https://x.test/other.png", { type: "image/webp" }),
    ]);
    const subject = resolve("UseLazyLoading", { url: "https://x.test/a.png#x", preview: { kind: "image" } });
    expect(subject).toMatchObject({ kind: "image", url: "https://x.test/a.png#x", declaredType: "image/png" });
  });

  it("sums the bytes of every request of a video, partial 206 included (US-016 S1)", () => {
    const resolve = createPreviewSubjectResolver([
      request("https://x.test/intro.mp4", { code: 206, type: "video/mp4", transferSize: 1_000_000 }),
      request("https://x.test/intro.mp4", { code: 206, type: "video/mp4", transferSize: 1_400_000 }),
      request("https://x.test/intro.mp4", { code: 200, type: "video/mp4", transferSize: 0, responseSize: 5_000 }),
      request("https://x.test/poster.jpg", { transferSize: 9_999 }),
    ]);
    expect(
      resolve("ProvideTextAlternatives", {
        url: "https://x.test/intro.mp4",
        prefix: "Vidéo ",
        preview: { kind: "video", display: { width: 640, height: 360 } },
      })
    ).toEqual({
      kind: "media",
      media: "video",
      url: "https://x.test/intro.mp4",
      ruleId: "ProvideTextAlternatives",
      mimeType: "video/mp4",
      downloadedBytes: 2_405_000,
      recordedStatus: 200,
      display: { width: 640, height: 360 },
    });
  });

  it("leaves the weight undefined when the page never requested the media (US-016 S4)", () => {
    const resolve = createPreviewSubjectResolver([]);
    const subject = resolve("AvoidMediaAutoplay", { url: "https://x.test/jingle.mp3", prefix: "Son ", preview: { kind: "audio" } });
    expect(subject).toEqual({ kind: "media", media: "audio", url: "https://x.test/jingle.mp3", ruleId: "AvoidMediaAutoplay" });
  });

  it("builds the iframe data from the document request (US-017 S1)", () => {
    const resolve = createPreviewSubjectResolver([
      request("https://www.google.com/maps/embed?pb=1", { type: "text/html", transferSize: 48_000 }),
    ]);
    expect(
      resolve("UseLazyLoading", {
        url: "https://www.google.com/maps/embed?pb=1#frag",
        prefix: "Iframe ",
        preview: { kind: "iframe", top: 2100 },
      })
    ).toEqual({
      kind: "iframe",
      url: "https://www.google.com/maps/embed?pb=1#frag",
      ruleId: "UseLazyLoading",
      host: "www.google.com",
      mimeType: "text/html",
      transferredBytes: 48_000,
      top: 2100,
    });
  });

  it("leaves the iframe type and weight undefined when the document was not recorded (US-017 S2)", () => {
    const resolve = createPreviewSubjectResolver([]);
    expect(
      resolve("UseLazyLoading", { url: "https://maps.test/embed", prefix: "Iframe ", preview: { kind: "iframe", top: 900 } })
    ).toEqual({ kind: "iframe", url: "https://maps.test/embed", ruleId: "UseLazyLoading", host: "maps.test", top: 900 });
  });

  it("builds a font subject (US-018)", () => {
    const resolve = createPreviewSubjectResolver([request("https://f.test/r.woff2", { type: "font/woff2" })]);
    expect(resolve("UseStandardFonts", { url: "https://f.test/r.woff2", preview: { kind: "font" } })).toEqual({
      kind: "font",
      url: "https://f.test/r.woff2",
      ruleId: "UseStandardFonts",
      declaredType: "font/woff2",
    });
  });

  it("builds a text subject with the recorded MIME type and charset (US-020 S1, S11)", () => {
    const resolve = createPreviewSubjectResolver([
      request("https://x.test/legacy.css", {
        type: "text/css",
        responseHeaders: { "content-type": "text/css; charset=ISO-8859-1" },
      }),
    ]);
    expect(
      resolve("MinifyTextFiles", { url: "https://x.test/legacy.css", preview: { kind: "text", type: "CSS" } })
    ).toEqual({
      kind: "text",
      url: "https://x.test/legacy.css",
      ruleId: "MinifyTextFiles",
      fileType: "CSS",
      declaredType: "text/css",
      charset: "iso-8859-1",
    });
  });

  it("omits the charset and declares '' when the file was not recorded", () => {
    const resolve = createPreviewSubjectResolver([]);
    expect(resolve("MinifyTextFiles", { url: "https://x.test/app.js", preview: { kind: "text", type: "JS" } })).toEqual({
      kind: "text",
      url: "https://x.test/app.js",
      ruleId: "MinifyTextFiles",
      fileType: "JS",
      declaredType: "",
    });
  });

  it("resolves a legacy MinifyTextFiles ref from the line text (US-020 S12)", () => {
    const resolve = createPreviewSubjectResolver([]);
    const offender = `main.css (CSS, ${formatKo(48_000)}) : non minifié (~23 % d'octets superflus)`;
    const skipped = `big.js (JS, ${formatKo(6_000_000)}) : non évalué (fichier trop volumineux)`;
    expect(resolve("MinifyTextFiles", { url: "https://x.test/main.css" }, offender)).toMatchObject({
      kind: "text",
      fileType: "CSS",
    });
    expect(resolve("MinifyTextFiles", { url: "https://x.test/big.js" }, skipped)).toBeUndefined();
    expect(resolve("MinifyTextFiles", { url: "https://x.test/main.css" })).toBeUndefined();
  });

  it("falls back to the rule and prefix for refs saved before the epic (epic §6)", () => {
    const resolve = createPreviewSubjectResolver([]);
    expect(resolve("LimitGifs", { url: "https://x.test/anim.gif" })).toEqual({
      kind: "image",
      url: "https://x.test/anim.gif",
      ruleId: "LimitGifs",
      declaredType: "",
    });
    expect(resolve("UseLazyLoading", { url: "https://m.test/e", prefix: "Iframe " })).toEqual({
      kind: "iframe",
      url: "https://m.test/e",
      ruleId: "UseLazyLoading",
      host: "m.test",
    });
    expect(resolve("ProvideTextAlternatives", { url: "https://x.test/hero.jpg" })).toBeUndefined();
  });

  it("never previews blob: or data: URLs, even with preview data (US-015 S7, US-016 S8)", () => {
    const resolve = createPreviewSubjectResolver([]);
    expect(resolve("AvoidMediaAutoplay", { url: "blob:https://x.test/1", prefix: "Vidéo ", preview: { kind: "video" } })).toBeUndefined();
    expect(resolve("ProvideTextAlternatives", { url: "data:image/png;base64,AAAA", preview: { kind: "image" } })).toBeUndefined();
  });

  it("indexes the requests once, lazily", () => {
    let reads = 0;
    const requests = [request("https://x.test/a.gif", { type: "image/gif" })];
    const spied = new Proxy(requests, {
      get(target, key, receiver) {
        if (key === Symbol.iterator || key === "length") reads++;
        return Reflect.get(target, key, receiver);
      },
    });
    const resolve = createPreviewSubjectResolver(spied);
    expect(reads).toBe(0);
    resolve("LimitGifs", { url: "https://x.test/a.gif" });
    const afterFirst = reads;
    resolve("LimitGifs", { url: "https://x.test/a.gif" });
    resolve("LimitGifs", { url: "https://x.test/b.gif" });
    expect(reads).toBe(afterFirst);
  });
});
