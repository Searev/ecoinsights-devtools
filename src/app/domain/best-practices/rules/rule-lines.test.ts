import { describe, expect, it } from "vitest";
import { capLines, fileLine, formatCount, plural } from "./rule-lines";

describe("fileLine", () => {
  it("starts the text with the file label and references the URL", () => {
    expect(fileLine("https://x.test/js/vendor.js?v=2", " (JS, 250 ko) : non compressé")).toEqual({
      text: "vendor.js (JS, 250 ko) : non compressé",
      ref: { url: "https://x.test/js/vendor.js?v=2" },
    });
  });

  it("puts the prefix before the name and in the ref", () => {
    expect(fileLine("https://x.test/intro.mp4", " : ni sous-titres ni libellé", "Vidéo ")).toEqual({
      text: "Vidéo intro.mp4 : ni sous-titres ni libellé",
      ref: { url: "https://x.test/intro.mp4", prefix: "Vidéo " },
    });
  });

  it("carries the preview data in the ref (EPIC-PV, ARCH-DECISION-020)", () => {
    expect(
      fileLine("https://x.test/intro.mp4", " : x", "Vidéo ", { kind: "video", display: { width: 640, height: 360 } })
    ).toEqual({
      text: "Vidéo intro.mp4 : x",
      ref: { url: "https://x.test/intro.mp4", prefix: "Vidéo ", preview: { kind: "video", display: { width: 640, height: 360 } } },
    });
    expect(fileLine("https://x.test/a.woff2", " : 64 ko", "", { kind: "font" }).ref).toEqual({
      url: "https://x.test/a.woff2",
      preview: { kind: "font" },
    });
  });

  it("keeps the preview through capLines", () => {
    const line = fileLine("https://x.test/a.gif", " : 9 ko", "", { kind: "image", display: { width: 0, height: 0 } });
    expect(capLines([line]).lineRefs).toEqual([
      { url: "https://x.test/a.gif", preview: { kind: "image", display: { width: 0, height: 0 } } },
    ]);
  });

  it("uses the decoded last segment, or the host for an empty path", () => {
    expect(fileLine("https://x.test/caf%C3%A9.css", " : x").text).toBe("café.css : x");
    expect(fileLine("https://x.test:8443/", " : x").text).toBe("x.test:8443 : x");
  });
});

describe("capLines", () => {
  const line = (i: number) => fileLine(`https://x.test/f${i}.js`, " : x");

  it("returns offenders and aligned lineRefs", () => {
    expect(capLines([line(1), { text: "example.org : 3 requêtes" }])).toEqual({
      offenders: ["f1.js : x", "example.org : 3 requêtes"],
      lineRefs: [{ url: "https://x.test/f1.js" }, null],
    });
  });

  it("omits lineRefs when no line names a file", () => {
    expect(capLines([{ text: "a" }, { text: "b" }])).toEqual({ offenders: ["a", "b"] });
  });

  it("returns an empty result without lines", () => {
    expect(capLines([])).toEqual({ offenders: [] });
  });

  it("keeps 20 lines then appends '… et N autres' with a null ref", () => {
    const lines = Array.from({ length: 23 }, (_, i) => line(i));
    const res = capLines(lines);
    expect(res.offenders).toHaveLength(21);
    expect(res.offenders[19]).toBe("f19.js : x");
    expect(res.offenders[20]).toBe("… et 3 autres");
    expect(res.lineRefs).toHaveLength(21);
    expect(res.lineRefs![20]).toBeNull();
  });

  it("uses the singular for one hidden line", () => {
    const res = capLines(Array.from({ length: 21 }, (_, i) => line(i)));
    expect(res.offenders[20]).toBe("… et 1 autre");
  });

  it("does not cap exactly 20 lines", () => {
    expect(capLines(Array.from({ length: 20 }, (_, i) => line(i))).offenders).toHaveLength(20);
  });
});

describe("plural", () => {
  it("uses the singular for 0 and 1, the plural above", () => {
    expect(plural(0, "fichier", "fichiers")).toBe("fichier");
    expect(plural(1, "fichier", "fichiers")).toBe("fichier");
    expect(plural(2, "fichier", "fichiers")).toBe("fichiers");
  });
});

describe("formatCount", () => {
  it("groups thousands the French way", () => {
    expect(formatCount(1500)).toBe((1500).toLocaleString("fr-FR"));
    expect(formatCount(42)).toBe("42");
  });
});
