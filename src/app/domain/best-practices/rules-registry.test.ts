// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { RULES } from "./index";
import { RULE_METADATA } from "./rule-metadata";

const CATEGORIES = ["content", "images", "fonts", "network", "css", "js"];

describe("RULES registry", () => {
  it("registers the seventeen rules in order (EPIC-BP2 after the first four, then EPIC-BP3)", () => {
    expect(RULES.map((r) => r.id)).toEqual([
      "PrintStyleSheet",
      "DontResizeImagesInBrowser",
      "UseOptimizedImageFormats",
      "UseStandardFonts",
      "ProvideTextAlternatives",
      "UseLazyLoading",
      "CompressTextFiles",
      "AddCacheHeaders",
      "MinifyTextFiles",
      "LimitDomains",
      "PreferHttp2",
      "LimitGifs",
      "AvoidMediaAutoplay",
      "ExternalizeCssJs",
      "LimitRequests",
      "LimitCssFiles",
      "LimitCanvas",
    ]);
  });

  it("the print, resize, format, fonts, BP2 DOM, GIF (display boxes, EPIC-PV) and BP3 DOM rules have a collector", () => {
    expect(RULES.filter((r) => r.collect).map((r) => r.id)).toEqual([
      "PrintStyleSheet",
      "DontResizeImagesInBrowser",
      "UseOptimizedImageFormats",
      "UseStandardFonts",
      "ProvideTextAlternatives",
      "UseLazyLoading",
      "LimitGifs",
      "AvoidMediaAutoplay",
      "ExternalizeCssJs",
      "LimitCanvas",
    ]);
  });

  it("only the minification rule declares content analyses", () => {
    expect(RULES.filter((r) => r.contentAnalyses).map((r) => r.id)).toEqual(["MinifyTextFiles"]);
  });

  it("has unique ids", () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
  });

  it.each(RULES.map((r) => [r.id, r] as const))("%s has valid metadata", (_, r) => {
    expect(r.name.trim()).not.toBe("");
    expect(CATEGORIES).toContain(r.category);
  });

  const collectable = RULES.filter((r) => r.collect).map((r) => [r.id, r] as const);

  it.each(collectable)("%s collect is self-contained", (_, r) => {
    const rebuilt = new Function(`return (${r.collect!.toString()})`)();
    expect(() => rebuilt()).not.toThrow();
  });

  it.each(collectable)("%s collect result is JSON-serialisable", (_, r) => {
    const out = r.collect!();
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("RULE_METADATA registry (US-028, ARCH-DECISION-032)", () => {
  // Reference label and link of each rule, from the table of US-028 section 2.
  const STORY_TABLE: readonly (readonly [string, string | undefined, string | undefined])[] = [
    ["AddCacheHeaders", "RWEB 0075", "https://rweb.greenit.fr/fr/fiches/RWEB_0075-ajouter-des-entetes-expires-ou-cache-control"],
    ["AvoidMediaAutoplay", "RWEB 0106", "https://rweb.greenit.fr/fr/fiches/RWEB_0106-eviter-la-lecture-et-le-chargement-automatique-des-videos-et-des-sons"],
    ["CompressTextFiles", "RWEB 0076", "https://rweb.greenit.fr/fr/fiches/RWEB_0076-compresser-les-fichiers-css-javascript-html-et-svg"],
    ["DontResizeImagesInBrowser", "RWEB 0048", "https://rweb.greenit.fr/fr/fiches/RWEB_0048-ne-pas-redimensionner-les-images-cote-navigateur"],
    ["ExternalizeCssJs", "RWEB 0042", "https://rweb.greenit.fr/fr/fiches/RWEB_0042-externaliser-les-css-et-javascript"],
    ["LimitCanvas", "RWEB 0055", "https://rweb.greenit.fr/fr/fiches/RWEB_0055-limiter-le-recours-aux-canvas"],
    ["LimitCssFiles", "RWEB 0035", "https://rweb.greenit.fr/fr/fiches/RWEB_0035-limiter-le-nombre-de-css"],
    ["LimitDomains", "RWEB 0082", "https://rweb.greenit.fr/fr/fiches/RWEB_0082-limiter-le-nombre-de-domaines-servant-les-ressources"],
    ["LimitGifs", "RWEB 0099", "https://rweb.greenit.fr/fr/fiches/RWEB_0099-limiter-l-utilisation-des-gifs-animes"],
    ["LimitRequests", "RWEB 0047", "https://rweb.greenit.fr/fr/fiches/RWEB_0047-limiter-le-nombre-de-requetes-http"],
    ["MinifyTextFiles", "RWEB 0077", "https://rweb.greenit.fr/fr/fiches/RWEB_0077-minifier-les-fichiers-css-javascript-html-et-svg"],
    ["UseOptimizedImageFormats", "RWEB 0049", "https://rweb.greenit.fr/fr/fiches/RWEB_0049-optimiser-les-images"],
    ["PreferHttp2", "RWEB 0083", "https://rweb.greenit.fr/fr/fiches/RWEB_0083-privilegier-http2-a-http1"],
    ["PrintStyleSheet", "RWEB 0031", "https://rweb.greenit.fr/fr/fiches/RWEB_0031-fournir-une-css-print"],
    ["ProvideTextAlternatives", "RGAA 1.1", "https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/#1.1"],
    ["UseStandardFonts", "RWEB 0032", "https://rweb.greenit.fr/fr/fiches/RWEB_0032-favoriser-les-polices-standards"],
    ["UseLazyLoading", "RWEB 0051", "https://rweb.greenit.fr/fr/fiches/RWEB_0051-utiliser-le-chargement-paresseux"],
  ];

  it("has exactly the ids of RULES as keys", () => {
    expect(Object.keys(RULE_METADATA).sort()).toEqual(RULES.map((r) => r.id).sort());
  });

  it.each(STORY_TABLE)("%s matches the story table", (id, label, link) => {
    const meta = RULE_METADATA[id];
    const actual = meta.reference ? `${meta.reference.referential} ${meta.reference.code}` : undefined;
    expect(actual).toBe(label);
    expect(meta.link).toBe(link);
    expect("link" in meta).toBe(link !== undefined);
  });

  it("covers every rule of the story table", () => {
    expect(STORY_TABLE.map((row) => row[0]).sort()).toEqual(RULES.map((r) => r.id).sort());
  });

  it("uses https links, and only rules with a reference have one", () => {
    for (const meta of Object.values(RULE_METADATA)) {
      if (meta.link === undefined) continue;
      expect(meta.link.startsWith("https://")).toBe(true);
      expect(meta.reference).toBeDefined();
    }
  });
});
