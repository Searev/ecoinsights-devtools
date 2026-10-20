// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNAVAILABLE_ESTIMATES } from "../../models/image-estimation";
import {
  AlternativeElement,
  ProvideTextAlternativesPage,
  provideTextAlternativesRule as rule,
} from "./provide-text-alternatives.rule";

const el = (over: Partial<AlternativeElement> = {}): AlternativeElement => ({
  kind: "img",
  url: "https://x.test/a.png",
  decorative: false,
  trackingPixel: false,
  alt: null,
  ariaLabel: null,
  labelledByText: null,
  title: null,
  hasCaptions: false,
  ...over,
});

const ev = (page: ProvideTextAlternativesPage | undefined) =>
  rule.evaluate({ url: "https://x.test", requests: [], page, estimates: UNAVAILABLE_ESTIMATES });
const evEls = (...elements: AlternativeElement[]) => ev({ elements });

describe("provideTextAlternativesRule metadata", () => {
  it("has the expected id, name and category", () => {
    expect(rule.id).toBe("ProvideTextAlternatives");
    expect(rule.name).toBe("Fournir une alternative textuelle aux contenus multimédias");
    expect(rule.category).toBe("content");
  });
});

describe("provideTextAlternativesRule.evaluate", () => {
  it("scenario 1: alternatives everywhere gives A", () => {
    const r = evEls(
      el({ url: "https://x.test/logo.png", alt: "Logo EcoInsights" }),
      el({ kind: "video", url: "https://x.test/v.mp4", hasCaptions: true })
    );
    expect(r.compliance).toBe("A");
    expect(r.offenders).toBeUndefined();
  });

  it("scenario 2: missing alt gives C with its line", () => {
    const r = evEls(el({ url: "https://x.test/img/hero.jpg" }));
    expect(r.compliance).toBe("C");
    expect(r.offenders).toEqual(["hero.jpg : alternative absente"]);
    expect(r.lineRefs).toEqual([{ url: "https://x.test/img/hero.jpg", preview: { kind: "image" } }]);
    expect(r.detail).toBe("1 contenu multimédia sans alternative textuelle");
  });

  it("scenario 3: empty alt gives B", () => {
    const r = evEls(el({ url: "https://x.test/separator.png", alt: "" }));
    expect(r.compliance).toBe("B");
    expect(r.offenders).toEqual([
      "separator.png : alternative vide (à vérifier si l'image n'est pas décorative)",
    ]);
    expect(r.detail).toBe("1 alternative vide à vérifier");
  });

  it("whitespace-only alt is empty", () => {
    expect(evEls(el({ alt: "  \n " })).compliance).toBe("B");
  });

  it("scenario 4: C wins over B and missing is listed first", () => {
    const r = evEls(
      el({ url: "https://x.test/a-empty.png", alt: "" }),
      el({ url: "https://x.test/z-missing.png" })
    );
    expect(r.compliance).toBe("C");
    expect(r.offenders).toEqual([
      "z-missing.png : alternative absente",
      "a-empty.png : alternative vide (à vérifier si l'image n'est pas décorative)",
    ]);
    expect(r.detail).toBe(
      "1 contenu multimédia sans alternative textuelle, 1 alternative vide à vérifier"
    );
  });

  it("detail pluralises", () => {
    const r = evEls(
      el({ url: "https://x.test/1.png" }),
      el({ url: "https://x.test/2.png" }),
      el({ url: "https://x.test/3.png", alt: "" }),
      el({ url: "https://x.test/4.png", alt: "" })
    );
    expect(r.detail).toBe(
      "2 contenus multimédias sans alternative textuelle, 2 alternatives vides à vérifier"
    );
    expect(evEls(el({ alt: "" }), el({ alt: "" }), el({ alt: "" })).detail).toBe(
      "3 alternatives vides à vérifier"
    );
  });

  it("scenario 5: decorative images are ignored", () => {
    const r = evEls(
      el({ url: "https://x.test/deco.png", alt: "", decorative: true }),
      el({ url: "https://x.test/deco2.png", decorative: true })
    );
    expect(r.compliance).toBe("A");
    expect(r.offenders).toBeUndefined();
  });

  it("scenario 6: aria-label and aria-labelledby are valid alternatives", () => {
    expect(evEls(el({ ariaLabel: "Évolution des émissions" })).compliance).toBe("A");
    expect(evEls(el({ labelledByText: "Titre" })).compliance).toBe("A");
    // an ARIA label also rescues an empty alt
    expect(evEls(el({ alt: "", ariaLabel: "x" })).compliance).toBe("A");
  });

  it("blank aria-label does not count", () => {
    expect(evEls(el({ ariaLabel: "   " })).compliance).toBe("C");
    expect(evEls(el({ labelledByText: "" })).compliance).toBe("C");
  });

  it("scenario 8: video without captions or label gives C", () => {
    const r = evEls(el({ kind: "video", url: "https://x.test/intro.mp4" }));
    expect(r.compliance).toBe("C");
    expect(r.offenders).toEqual(["Vidéo intro.mp4 : ni sous-titres ni libellé"]);
    expect(r.lineRefs).toEqual([
      { url: "https://x.test/intro.mp4", prefix: "Vidéo ", preview: { kind: "video" } },
    ]);
  });

  it("video: title, aria-label, labelledby or captions are alternatives", () => {
    const v = (over: Partial<AlternativeElement>) => el({ kind: "video", ...over });
    expect(evEls(v({ title: "Intro" })).compliance).toBe("A");
    expect(evEls(v({ title: "  " })).compliance).toBe("C");
    expect(evEls(v({ ariaLabel: "Intro" })).compliance).toBe("A");
    expect(evEls(v({ labelledByText: "Intro" })).compliance).toBe("A");
    expect(evEls(v({ hasCaptions: true })).compliance).toBe("A");
    // alt does not apply to videos
    expect(evEls(v({ alt: "x" })).compliance).toBe("C");
  });

  it("scenario 9: tracking pixels are ignored", () => {
    const r = evEls(el({ url: "https://x.test/pixel.gif", trackingPixel: true }));
    expect(r.compliance).toBe("A");
    expect(r.offenders).toBeUndefined();
  });

  it("scenario 10: no multimedia content", () => {
    const r = evEls();
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Aucun contenu multimédia sans alternative textuelle");
  });

  it("scenario 11: dangling aria-labelledby gives missing", () => {
    const r = evEls(el({ url: "https://x.test/a.png", labelledByText: "" }));
    expect(r.offenders).toEqual(["a.png : alternative absente"]);
  });

  it("elements without URL give plain-text lines", () => {
    const r = evEls(
      el({ url: null }),
      el({ kind: "video", url: null }),
      el({ url: null, alt: "" })
    );
    expect(r.offenders).toEqual([
      "(sans source) : alternative absente",
      "Vidéo (sans source) : ni sous-titres ni libellé",
      "(sans source) : alternative vide (à vérifier si l'image n'est pas décorative)",
    ]);
    expect(r.lineRefs).toBeUndefined();
  });

  it("sorts by URL then document order inside each group", () => {
    const r = evEls(
      el({ url: "https://x.test/b.png" }),
      el({ url: "https://x.test/a.png" }),
      el({ url: "https://x.test/b.png", kind: "input" })
    );
    expect(r.offenders).toEqual([
      "a.png : alternative absente",
      "b.png : alternative absente",
      "b.png : alternative absente",
    ]);
  });

  it("caps at 20 lines with lineRefs aligned", () => {
    const elements = Array.from({ length: 25 }, (_, i) =>
      el({ url: `https://x.test/i${String(i).padStart(2, "0")}.png` })
    );
    const r = ev({ elements });
    expect(r.offenders).toHaveLength(21);
    expect(r.offenders![20]).toBe("… et 5 autres");
    expect(r.lineRefs).toHaveLength(21);
    expect(r.lineRefs![20]).toBeNull();
  });

  it("without page data: no grade, explains", () => {
    const r = ev(undefined);
    expect(r.compliance).toBeUndefined();
    expect(r.detail).toBe("La page n'a pas pu être inspectée");
  });
});

describe("provideTextAlternativesRule.collect", () => {
  const collect = () => rule.collect!().elements;
  const stub = (node: Element, props: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(props)) {
      Object.defineProperty(node, k, { value: v, configurable: true });
    }
  };
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("extracts img, input[type=image], area[href] and video only", () => {
    document.body.innerHTML = `
      <img src="/a.png" alt="A">
      <input type="IMAGE" src="/b.png">
      <input type="text">
      <map><area href="/z" alt="Z"><area alt="no href"></map>
      <video src="/v.mp4"></video>
      <audio src="/s.mp3"></audio>`;
    expect(collect().map((e) => e.kind)).toEqual(["img", "input", "area", "video"]);
  });

  it("reads alt, aria-label and title attributes", () => {
    document.body.innerHTML = `<img src="/a.png" alt=" x " aria-label="L" title="T"><img src="/b.png">`;
    const [a, b] = collect();
    expect(a).toMatchObject({ alt: " x ", ariaLabel: "L", title: "T", url: expect.stringMatching(/\/a\.png$/) });
    expect(b).toMatchObject({ alt: null, ariaLabel: null, title: null });
  });

  it("resolves aria-labelledby ids, ignoring missing ones", () => {
    document.body.innerHTML = `
      <span id="l1"> Un </span><span id="l2">deux</span>
      <img src="/a.png" aria-labelledby="l1 missing l2">
      <img src="/b.png" aria-labelledby="missing">`;
    const [a, b] = collect();
    expect(a.labelledByText).toBe("Un deux");
    expect(b.labelledByText).toBe("");
  });

  it("flags decorative elements", () => {
    document.body.innerHTML = `
      <img src="/1.png" role="presentation"><img src="/2.png" role=" NONE foo">
      <img src="/3.png" aria-hidden="true"><img src="/4.png" aria-hidden="false"><img src="/5.png" role="img">`;
    expect(collect().map((e) => e.decorative)).toEqual([true, true, true, false, false]);
  });

  it("detects tracking pixels from natural size or attributes", () => {
    document.body.innerHTML = `
      <img id="p1" src="/p1.gif"><img id="p2" src="/p2.gif" width="1" height="1">
      <img id="n" src="/n.gif"><img id="big" src="/big.gif">
      <img id="w" src="/w.gif" width="1">`;
    const get = (id: string) => document.getElementById(id)!;
    stub(get("p1"), { complete: true, naturalWidth: 1, naturalHeight: 1 });
    stub(get("n"), { complete: false, naturalWidth: 0, naturalHeight: 0 });
    stub(get("big"), { complete: true, naturalWidth: 300, naturalHeight: 1 });
    expect(collect().map((e) => e.trackingPixel)).toEqual([true, true, false, false, false]);
  });

  it("detects captions with the HTML kind defaults", () => {
    document.body.innerHTML = `
      <video src="/1.mp4"><track kind="captions"></video>
      <video src="/2.mp4"><track kind="subtitles"></video>
      <video src="/3.mp4"><track></video>
      <video src="/4.mp4"><track kind=""></video>
      <video src="/5.mp4"><track kind="chapters"></video>
      <video src="/6.mp4"><track kind="bogus"></video>
      <video src="/7.mp4"></video>`;
    expect(collect().map((e) => e.hasCaptions)).toEqual([true, true, true, true, false, false, false]);
  });

  it("scenario 7: a picture is counted once, through its img", () => {
    document.body.innerHTML = `<picture><source srcset="/a.webp"><source srcset="/a.avif"><img src="/a.png" alt="Photo"></picture>`;
    expect(collect()).toHaveLength(1);
  });

  it("video URL: currentSrc, else src, else first source, else null", () => {
    document.body.innerHTML = `
      <video src="/a.mp4"></video>
      <video><source src="/b.webm"><source src="/c.mp4"></video>
      <video></video>`;
    const urls = collect().map((e) => e.url);
    expect(urls[0]).toMatch(/\/a\.mp4$/);
    expect(urls[1]).toMatch(/\/b\.webm$/);
    expect(urls[2]).toBeNull();
  });

  it("img without src gives a null URL", () => {
    document.body.innerHTML = `<img alt="x">`;
    expect(collect()[0].url).toBeNull();
  });

  it("is self-contained and JSON-serialisable", () => {
    document.body.innerHTML = `<img src="/a.png"><video src="/v.mp4"><track kind="captions"></video>`;
    const rebuilt = new Function(`return (${rule.collect!.toString()})`)();
    expect(() => rebuilt()).not.toThrow();
    const out = rebuilt();
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("provideTextAlternativesRule preview refs (EPIC-PV)", () => {
  it("img and input lines carry an image preview with the display box", () => {
    const r = evEls(
      el({ url: "https://x.test/a.png", box: { width: 300, height: 200 } }),
      el({ kind: "input", url: "https://x.test/b.png", box: { width: 40, height: 20 } })
    );
    expect(r.lineRefs).toEqual([
      { url: "https://x.test/a.png", preview: { kind: "image", display: { width: 300, height: 200 } } },
      { url: "https://x.test/b.png", preview: { kind: "image", display: { width: 40, height: 20 } } },
    ]);
  });

  it("video lines carry a video preview with the display box", () => {
    const r = evEls(el({ kind: "video", url: "https://x.test/v.mp4", box: { width: 640, height: 360 } }));
    expect(r.lineRefs).toEqual([
      {
        url: "https://x.test/v.mp4",
        prefix: "Vidéo ",
        preview: { kind: "video", display: { width: 640, height: 360 } },
      },
    ]);
  });

  it("area lines never carry a preview", () => {
    const r = evEls(el({ kind: "area", url: "https://x.test/z", box: { width: 5, height: 5 } }));
    expect(r.lineRefs).toEqual([{ url: "https://x.test/z" }]);
  });

  it("an element without box gives a preview without display", () => {
    const r = evEls(el({ url: "https://x.test/a.png" }));
    expect(r.lineRefs![0]!.preview).toEqual({ kind: "image" });
    expect(r.lineRefs![0]!.preview).not.toHaveProperty("display");
  });

  it("keeps a 0 x 0 box as is", () => {
    const r = evEls(el({ url: "https://x.test/a.png", box: { width: 0, height: 0 } }));
    expect(r.lineRefs![0]!.preview).toEqual({ kind: "image", display: { width: 0, height: 0 } });
  });
});

describe("provideTextAlternativesRule.collect boxes (EPIC-PV)", () => {
  const rectOf = (node: Element, width: number, height: number) => {
    const spy = vi.fn(() => ({ top: 0, left: 0, width, height, right: width, bottom: height }));
    Object.defineProperty(node, "getBoundingClientRect", { value: spy, configurable: true });
    return spy;
  };
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("rounds the box of img, input and video, and gives none to area", () => {
    document.body.innerHTML = `<img id="i" src="/a.png"><input id="n" type="image" src="/b.png"><map><area id="a" href="/z"></map><video id="v" src="/v.mp4"></video>`;
    rectOf(document.getElementById("i")!, 300.4, 199.6);
    rectOf(document.getElementById("n")!, 40, 20);
    const area = rectOf(document.getElementById("a")!, 9, 9);
    rectOf(document.getElementById("v")!, 640, 360);
    const [i, n, a, v] = rule.collect!().elements;
    expect(i.box).toEqual({ width: 300, height: 200 });
    expect(n.box).toEqual({ width: 40, height: 20 });
    expect(a.box).toBeUndefined();
    expect(a).not.toHaveProperty("box");
    expect(area).not.toHaveBeenCalled();
    expect(v.box).toEqual({ width: 640, height: 360 });
  });

  it("calls getBoundingClientRect once per element", () => {
    document.body.innerHTML = `<img id="i" src="/a.png"><video id="v" src="/v.mp4"></video>`;
    const s1 = rectOf(document.getElementById("i")!, 1, 1);
    const s2 = rectOf(document.getElementById("v")!, 1, 1);
    rule.collect!();
    expect(s1).toHaveBeenCalledTimes(1);
    expect(s2).toHaveBeenCalledTimes(1);
  });
});

describe("provideTextAlternativesRule performance", () => {
  it("collects and evaluates 2 000 elements within budget", () => {
    document.body.innerHTML = Array.from(
      { length: 2000 },
      (_, i) => `<img src="/i${i}.png" ${i % 2 ? 'alt="x"' : ""}>`
    ).join("");
    rule.evaluate({ url: "", requests: [], page: rule.collect!(), estimates: UNAVAILABLE_ESTIMATES });
    // Best of 3 to absorb scheduling noise when the whole suite runs in parallel.
    let ms = Infinity;
    let r = rule.evaluate({ url: "", requests: [], page: { elements: [] }, estimates: UNAVAILABLE_ESTIMATES });
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      const page = rule.collect!();
      r = rule.evaluate({ url: "", requests: [], page, estimates: UNAVAILABLE_ESTIMATES });
      ms = Math.min(ms, performance.now() - t0);
    }
    expect(r.compliance).toBe("C");
    expect(ms).toBeLessThan(50);
  });
});
