// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNAVAILABLE_ESTIMATES } from "../../models/image-estimation";
import { AutoplayMedia, AvoidMediaAutoplayPage, avoidMediaAutoplayRule as rule } from "./avoid-media-autoplay.rule";

const media = (over: Partial<AutoplayMedia> = {}): AutoplayMedia => ({
  kind: "video",
  url: "https://x.test/a.mp4",
  autoplay: false,
  preload: null,
  ...over,
});
const ev = (page: AvoidMediaAutoplayPage | undefined) =>
  rule.evaluate({ url: "https://x.test", requests: [], page, estimates: UNAVAILABLE_ESTIMATES });
const evM = (...items: AutoplayMedia[]) => ev({ media: items });

const AUTO = "lecture automatique";
const PRELOAD = 'préchargement complet (preload="auto")';

describe("avoidMediaAutoplayRule metadata", () => {
  it("has the expected id, name and category", () => {
    expect(rule.id).toBe("AvoidMediaAutoplay");
    expect(rule.name).toBe("Éviter la lecture et le chargement automatique des vidéos et des sons");
    expect(rule.category).toBe("content");
  });
});

describe("avoidMediaAutoplayRule.evaluate", () => {
  it("scenario 1: media waiting for the user gives A", () => {
    const r = evM(
      media({ url: "https://x.test/demo.mp4", preload: "none" }),
      media({ kind: "audio", url: "https://x.test/podcast.mp3" })
    );
    expect(r.compliance).toBe("A");
    expect(r.offenders).toBeUndefined();
  });

  it("scenario 2: one autoplay video gives B", () => {
    const r = evM(media({ url: "https://x.test/hero.mp4", autoplay: true }));
    expect(r.compliance).toBe("B");
    expect(r.offenders).toEqual([`Vidéo hero.mp4 : ${AUTO}`]);
    expect(r.lineRefs).toEqual([
      { url: "https://x.test/hero.mp4", prefix: "Vidéo ", preview: { kind: "video" } },
    ]);
    expect(r.detail).toBe("1 vidéo ou son lancé ou préchargé automatiquement");
  });

  it("scenario 3: autoplay is an offender whatever its value (collected as a boolean)", () => {
    expect(evM(media({ autoplay: true })).compliance).toBe("B");
  });

  it("scenario 4: preload auto or empty gives C", () => {
    const r = evM(
      media({ kind: "audio", url: "https://x.test/jingle.mp3", preload: "auto" }),
      media({ url: "https://x.test/clip.mp4", preload: "" })
    );
    expect(r.compliance).toBe("C");
    expect(r.offenders).toEqual([`Vidéo clip.mp4 : ${PRELOAD}`, `Son jingle.mp3 : ${PRELOAD}`]);
    expect(r.lineRefs![1]).toEqual({
      url: "https://x.test/jingle.mp3",
      prefix: "Son ",
      preview: { kind: "audio" },
    });
    expect(r.detail).toBe("2 vidéos ou sons lancés ou préchargés automatiquement");
  });

  it("preload is case-insensitive and trimmed", () => {
    expect(evM(media({ preload: " AUTO " })).compliance).toBe("B");
  });

  it("scenario 5: preload metadata, none or absent is compliant", () => {
    expect(evM(media({ preload: "metadata" }), media({ url: "https://x.test/b.mp4" })).compliance).toBe("A");
    expect(evM(media({ preload: "none" })).compliance).toBe("A");
  });

  it("scenario 6: both reasons on one element count once", () => {
    const r = evM(media({ url: "https://x.test/bg.mp4", autoplay: true, preload: "auto" }));
    expect(r.compliance).toBe("B");
    expect(r.offenders).toEqual([`Vidéo bg.mp4 : ${AUTO} et ${PRELOAD}`]);
  });

  it("scenario 8: no media", () => {
    const r = evM();
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Aucune vidéo ni aucun son lancé ou préchargé automatiquement");
  });

  it("media without source gives a plain-text line", () => {
    const r = evM(media({ url: null, autoplay: true }), media({ kind: "audio", url: null, autoplay: true }));
    expect(r.offenders).toEqual([`Vidéo (sans source) : ${AUTO}`, `Son (sans source) : ${AUTO}`]);
    expect(r.lineRefs).toBeUndefined();
  });

  it("sorts by URL then document order", () => {
    const r = evM(
      media({ url: "https://x.test/b.mp4", autoplay: true }),
      media({ url: "https://x.test/a.mp4", autoplay: true })
    );
    expect(r.offenders![0]).toMatch(/^Vidéo a\.mp4/);
  });

  it("caps at 20 lines", () => {
    const r = evM(...Array.from({ length: 23 }, (_, i) => media({ url: `https://x.test/${i}.mp4`, autoplay: true })));
    expect(r.offenders).toHaveLength(21);
    expect(r.offenders![20]).toBe("… et 3 autres");
    expect(r.lineRefs).toHaveLength(21);
  });

  it("without page data: no grade", () => {
    const r = ev(undefined);
    expect(r.compliance).toBeUndefined();
    expect(r.detail).toBe("La page n'a pas pu être inspectée");
  });
});

describe("avoidMediaAutoplayRule.collect", () => {
  const collect = () => rule.collect!().media;
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reads video and audio elements only", () => {
    document.body.innerHTML = `<video src="/a.mp4"></video><audio src="/b.mp3"></audio><img src="/c.png">`;
    expect(collect().map((m) => m.kind)).toEqual(["video", "audio"]);
  });

  it("scenario 3: autoplay attribute counts whatever its value", () => {
    document.body.innerHTML = `<video src="/a.mp4" autoplay="false"></video><video src="/b.mp4" autoplay></video><video src="/c.mp4"></video>`;
    expect(collect().map((m) => m.autoplay)).toEqual([true, true, false]);
  });

  it("reads the raw preload attribute, null when absent", () => {
    document.body.innerHTML = `<video src="/a.mp4" preload=""></video><video src="/b.mp4" preload="Auto"></video><video src="/c.mp4"></video>`;
    expect(collect().map((m) => m.preload)).toEqual(["", "Auto", null]);
  });

  it("scenario 7: name from src, else the first source child", () => {
    document.body.innerHTML = `
      <video src="/a.mp4"></video>
      <video autoplay><source src="/media/teaser.webm"><source src="/media/t.mp4"></video>
      <audio></audio>`;
    const urls = collect().map((m) => m.url);
    expect(urls[0]).toMatch(/\/a\.mp4$/);
    expect(urls[1]).toMatch(/\/media\/teaser\.webm$/);
    expect(urls[2]).toBeNull();
  });

  it("is self-contained and JSON-serialisable", () => {
    document.body.innerHTML = `<video src="/a.mp4" autoplay></video>`;
    const rebuilt = new Function(`return (${rule.collect!.toString()})`)();
    expect(() => rebuilt()).not.toThrow();
    const out = rebuilt();
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("avoidMediaAutoplayRule preview refs (EPIC-PV)", () => {
  it("video lines carry the display box", () => {
    const r = evM(media({ autoplay: true, box: { width: 640, height: 360 } }));
    expect(r.lineRefs![0]!.preview).toEqual({ kind: "video", display: { width: 640, height: 360 } });
  });

  it("video lines without box carry no display", () => {
    const r = evM(media({ autoplay: true }));
    expect(r.lineRefs![0]!.preview).toEqual({ kind: "video" });
    expect(r.lineRefs![0]!.preview).not.toHaveProperty("display");
  });

  it("audio lines carry an audio preview", () => {
    const r = evM(media({ kind: "audio", url: "https://x.test/s.mp3", autoplay: true }));
    expect(r.lineRefs![0]!.preview).toEqual({ kind: "audio" });
  });

  it("lines without source stay plain", () => {
    const r = evM(media({ url: null, autoplay: true, box: { width: 1, height: 1 } }));
    expect(r.offenders).toEqual(["Vidéo (sans source) : lecture automatique"]);
    expect(r.lineRefs).toBeUndefined();
  });
});

describe("avoidMediaAutoplayRule.collect boxes (EPIC-PV)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("collects the rounded box of videos only, with one rect read each", () => {
    document.body.innerHTML = `<video id="v" src="/a.mp4"></video><audio id="s" src="/b.mp3"></audio>`;
    const v = vi.fn(() => ({ top: 0, left: 0, width: 640.4, height: 359.6, right: 0, bottom: 0 }));
    const s = vi.fn(() => ({ top: 0, left: 0, width: 10, height: 10, right: 0, bottom: 0 }));
    Object.defineProperty(document.getElementById("v")!, "getBoundingClientRect", { value: v, configurable: true });
    Object.defineProperty(document.getElementById("s")!, "getBoundingClientRect", { value: s, configurable: true });
    const [video, audio] = rule.collect!().media;
    expect(video.box).toEqual({ width: 640, height: 360 });
    expect(audio).not.toHaveProperty("box");
    expect(v).toHaveBeenCalledTimes(1);
    expect(s).not.toHaveBeenCalled();
  });
});

describe("avoidMediaAutoplayRule performance", () => {
  it("collects and evaluates 500 media elements within budget", () => {
    document.body.innerHTML = Array.from(
      { length: 500 },
      (_, i) => `<video src="/v${i}.mp4" ${i % 2 ? "autoplay" : 'preload="none"'}></video>`
    ).join("");
    const run = () =>
      rule.evaluate({ url: "", requests: [], page: rule.collect!(), estimates: UNAVAILABLE_ESTIMATES });
    run();
    // Best of 3 to absorb scheduling noise when the whole suite runs in parallel.
    let ms = Infinity;
    let r = run();
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      r = run();
      ms = Math.min(ms, performance.now() - t0);
    }
    expect(r.compliance).toBe("C");
    expect(ms).toBeLessThan(20);
  });
});
