import { describe, expect, it, vi } from "vitest";
import { MAX_CONTENT_BYTES } from "../../domain/text-content/policy";
import { measureMinification } from "../../domain/text-content/minification";
import { ContentJob } from "../../domain/models/text-content";
import {
  createDevtoolsContentAnalyser,
  DevtoolsContentAnalyserDeps,
} from "./devtools-content-analyser";

type Content = { content: string; encoding?: string } | null;

const toBase64 = (bytes: number[] | Uint8Array) => Buffer.from(bytes).toString("base64");

function setup(content: Content | (() => Promise<Content>), extra: Partial<DevtoolsContentAnalyserDeps> = {}) {
  const yields = vi.fn(() => Promise.resolve());
  const getDevtoolsContent = vi.fn(
    typeof content === "function" ? content : () => Promise.resolve(content)
  );
  const analyser = createDevtoolsContentAnalyser({
    getDevtoolsContent,
    yieldToEventLoop: yields,
    ...extra,
  });
  return { analyser, yields, getDevtoolsContent };
}

const job = (overrides: Partial<ContentJob> = {}): ContentJob => ({
  url: "https://example.org/app.js",
  type: "JS",
  ...overrides,
});

const SOURCE = "function f(a,  b) {\n  // note\n  return a + b;\n}\n";

describe("createDevtoolsContentAnalyser", () => {
  it("measures a plain text content", async () => {
    const { analyser, getDevtoolsContent } = setup({ content: SOURCE });
    const outcome = await analyser.analyse(job());
    expect(getDevtoolsContent).toHaveBeenCalledWith("https://example.org/app.js");
    expect(outcome).toEqual({ status: "analysed", ...measureMinification(SOURCE, "JS") });
  });

  it("scans according to the job type", async () => {
    const css = "a { color: red; }\n/* c */\n";
    const { analyser } = setup({ content: css });
    expect(await analyser.analyse(job({ url: "https://example.org/a.css", type: "CSS" }))).toEqual({
      status: "analysed",
      ...measureMinification(css, "CSS"),
    });
  });

  it("decodes a base64 content reported by Chrome", async () => {
    const { analyser } = setup({ content: toBase64(Buffer.from(SOURCE)), encoding: "base64" });
    expect(await analyser.analyse(job())).toEqual({ status: "analysed", ...measureMinification(SOURCE, "JS") });
  });

  it("decodes a base64 content without encoding (Firefox)", async () => {
    const { analyser } = setup({ content: toBase64(Buffer.from(SOURCE)) });
    expect(await analyser.analyse(job())).toEqual({ status: "analysed", ...measureMinification(SOURCE, "JS") });
  });

  it("does not decode plain text that is not made only of base64 characters", async () => {
    const { analyser } = setup({ content: "abcd efgh" });
    expect(await analyser.analyse(job())).toMatchObject({ status: "analysed", characters: 9 });
  });

  it("decodes UTF-8 across slice boundaries", async () => {
    const text = "é".repeat(50);
    const { analyser } = setup(
      { content: toBase64(Buffer.from(text)), encoding: "base64" },
      { sliceCharacters: 4 }
    );
    expect(await analyser.analyse(job())).toMatchObject({ status: "analysed", characters: 50 });
  });

  it("decodes with the charset of the job (iso-8859-1)", async () => {
    // C3 A9 is "é" in UTF-8 but two characters in iso-8859-1.
    const bytes = new Uint8Array(20).map((_, i) => (i % 2 === 0 ? 0xc3 : 0xa9));
    const content = { content: toBase64(bytes), encoding: "base64" };
    const latin = await setup(content).analyser.analyse(job({ charset: "iso-8859-1" }));
    const utf8 = await setup(content).analyser.analyse(job());
    expect(latin).toMatchObject({ characters: 20 });
    expect(utf8).toMatchObject({ characters: 10 });
  });

  it("falls back to UTF-8 for an unknown charset", async () => {
    const { analyser } = setup({ content: toBase64(Buffer.from("héllo")), encoding: "base64" });
    expect(await analyser.analyse(job({ charset: "x-does-not-exist" }))).toMatchObject({
      status: "analysed",
      characters: 5,
    });
  });

  it("is content-unavailable for null or empty content, without any other work", async () => {
    for (const content of [null, { content: "" }]) {
      const { analyser, yields, getDevtoolsContent } = setup(content);
      expect(await analyser.analyse(job())).toEqual({ status: "not-evaluated", reason: "content-unavailable" });
      expect(getDevtoolsContent).toHaveBeenCalledTimes(1);
      expect(yields).not.toHaveBeenCalled();
    }
  });

  it("is too-large over MAX_CONTENT_BYTES characters, without scanning", async () => {
    const { analyser, yields } = setup({ content: "a".repeat(MAX_CONTENT_BYTES + 1) });
    expect(await analyser.analyse(job())).toEqual({ status: "not-evaluated", reason: "too-large" });
    expect(yields).not.toHaveBeenCalled();
  });

  it("is too-large over MAX_CONTENT_BYTES decoded bytes (base64)", async () => {
    const { analyser, yields } = setup({
      content: "A".repeat(Math.ceil(((MAX_CONTENT_BYTES + 1) * 4) / 3 / 4) * 4),
      encoding: "base64",
    });
    expect(await analyser.analyse(job())).toEqual({ status: "not-evaluated", reason: "too-large" });
    expect(yields).not.toHaveBeenCalled();
  });

  it("accepts exactly MAX_CONTENT_BYTES characters", async () => {
    const { analyser } = setup({ content: " ".repeat(MAX_CONTENT_BYTES) });
    expect(await analyser.analyse(job())).toMatchObject({ status: "analysed", characters: MAX_CONTENT_BYTES });
  });

  it("is analysis-failed, with a message, when decoding throws", async () => {
    const { analyser } = setup({ content: "!!!not base64!!!", encoding: "base64" });
    const outcome = await analyser.analyse(job());
    expect(outcome).toMatchObject({ status: "not-evaluated", reason: "analysis-failed" });
    expect((outcome as { message?: string }).message).toBeTruthy();
  });

  it("is analysis-failed, never a rejection, when reading the content throws", async () => {
    const { analyser } = setup(() => Promise.reject(new Error("boom")));
    expect(await analyser.analyse(job())).toEqual({
      status: "not-evaluated",
      reason: "analysis-failed",
      message: "boom",
    });
  });

  it("yields between slices: 3 yields for 1 MB with the default slice", async () => {
    const { analyser, yields } = setup({ content: "a;".repeat(500_000) });
    expect(await analyser.analyse(job())).toMatchObject({ status: "analysed", characters: 1_000_000 });
    expect(yields).toHaveBeenCalledTimes(3);
  });

  it("does not yield for a content that fits in one slice", async () => {
    const { analyser, yields } = setup({ content: SOURCE });
    await analyser.analyse(job());
    expect(yields).not.toHaveBeenCalled();
  });

  it("gives the same result whatever the slice size", async () => {
    const text = SOURCE.repeat(200);
    const reference = await setup({ content: text }).analyser.analyse(job());
    for (const sliceCharacters of [1, 3, 7, 64, 1000]) {
      const outcome = await setup({ content: text }, { sliceCharacters }).analyser.analyse(job());
      expect(outcome, `slice ${sliceCharacters}`).toEqual(reference);
    }
  });

  it("uses setTimeout for the default yield", async () => {
    vi.useFakeTimers();
    try {
      const analyser = createDevtoolsContentAnalyser({
        getDevtoolsContent: () => Promise.resolve({ content: "a;".repeat(10) }),
        sliceCharacters: 8,
      });
      const pending = analyser.analyse(job());
      await vi.runAllTimersAsync();
      expect(await pending).toMatchObject({ status: "analysed", characters: 20 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancel() settles the analysis in progress as analysis-stopped at its next yield", async () => {
    const holder: { analyser?: ReturnType<typeof createDevtoolsContentAnalyser> } = {};
    let yieldCount = 0;
    const analyser = createDevtoolsContentAnalyser({
      getDevtoolsContent: () => Promise.resolve({ content: "a;".repeat(100) }),
      sliceCharacters: 10,
      yieldToEventLoop: async () => {
        yieldCount++;
        if (yieldCount === 2) holder.analyser?.cancel?.();
      },
    });
    holder.analyser = analyser;
    expect(await analyser.analyse(job())).toEqual({ status: "not-evaluated", reason: "analysis-stopped" });
    expect(yieldCount).toBe(2);
  });

  it("cancel() during the content read stops the analysis before scanning", async () => {
    let release!: (value: Content) => void;
    const { analyser, yields } = setup(() => new Promise<Content>((resolve) => (release = resolve)));
    const pending = analyser.analyse(job());
    analyser.cancel?.();
    release({ content: "a;".repeat(100) });
    expect(await pending).toEqual({ status: "not-evaluated", reason: "analysis-stopped" });
    expect(yields).not.toHaveBeenCalled();
  });

  it("analyses normally after a cancel (a new analysis starts clean)", async () => {
    const { analyser } = setup({ content: SOURCE });
    analyser.cancel?.();
    expect(await analyser.analyse(job())).toMatchObject({ status: "analysed" });
  });

  it("has no fetch dependency: nothing is re-downloaded", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { analyser } = setup(null);
    await analyser.analyse(job());
    await setup({ content: SOURCE }).analyser.analyse(job());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
