import { describe, expect, it } from "vitest";
import { FontPreviewSubject, PreviewFileResult, PreviewFontInfo } from "../../../domain/models/file-preview";
import { createPreviewFileStore } from "../../../domain/file-preview/preview-store";
import {
  FakePreviewFileLoader,
  deferred,
  flush,
  loadedFont,
} from "../../../domain/file-preview/testing/fake-preview-file-loader";
import { FontPreviewState, createFontPreviewController } from "./font-preview-controller";
import { FontRegistry } from "./font-registry";

const SUBJECT: FontPreviewSubject = {
  kind: "font",
  url: "https://x.test/roboto.woff2",
  ruleId: "UseStandardFonts",
  declaredType: "font/woff2",
};

type Registration = ReturnType<typeof deferred<Awaited<ReturnType<FontRegistry["register"]>>>> & {
  released: number;
};

/** Fake registry: each register waits for the test, or settles at once with `auto`. */
function fakeRegistry(auto?: "ok" | "fail") {
  const registrations: Registration[] = [];
  const registry: FontRegistry = {
    register(): Promise<Awaited<ReturnType<FontRegistry["register"]>>> {
      const d = deferred<Awaited<ReturnType<FontRegistry["register"]>>>();
      const entry = Object.assign(d, { released: 0 }) as Registration;
      registrations.push(entry);
      const n = registrations.length;
      if (auto === "ok") d.resolve({ ok: true, family: `fam-${n}`, release: () => void entry.released++ });
      if (auto === "fail") d.resolve({ ok: false, message: "nope" });
      return d.promise;
    },
  };
  const succeed = (i: number) =>
    registrations[i]!.resolve({ ok: true, family: `fam-${i + 1}`, release: () => void registrations[i]!.released++ });
  return { registry, registrations, succeed };
}

function setup(auto?: "ok" | "fail") {
  const loader = new FakePreviewFileLoader();
  const store = createPreviewFileStore(loader);
  const reg = fakeRegistry(auto);
  const controller = createFontPreviewController({ store, fonts: reg.registry });
  const states: FontPreviewState[] = [];
  controller.subscribe((s) => states.push(s));
  return { loader, store, controller, states, ...reg };
}

describe("font preview controller", () => {
  it("S1: loads, registers and shows the downloaded font", async () => {
    const { controller, loader, registrations, succeed } = setup();
    controller.open(SUBJECT);
    expect(controller.state().open).toBe(true);
    expect(controller.state().choice).toBe("downloaded");
    expect(controller.state().font.status).toBe("loading");
    expect(loader.fonts[0]).toMatchObject({ url: SUBJECT.url, declaredType: "font/woff2" });
    loader.fonts[0]!.resolve(loadedFont(64_000));
    await flush();
    expect(registrations).toHaveLength(1);
    expect(controller.state().font.status).toBe("loading");
    succeed(0);
    await flush();
    const font = controller.state().font;
    expect(font).toMatchObject({ status: "loaded", family: "fam-1" });
    if (font.status === "loaded") expect(font.info.byteLength).toBe(64_000);
  });

  it("S2: selecting never reloads or re-registers", async () => {
    const { controller, loader, registrations } = setup("ok");
    controller.open(SUBJECT);
    loader.fonts[0]!.resolve(loadedFont(10));
    await flush();
    controller.select("serif");
    expect(controller.state().choice).toBe("serif");
    controller.select("downloaded");
    expect(controller.state().choice).toBe("downloaded");
    expect(loader.fonts).toHaveLength(1);
    expect(registrations).toHaveLength(1);
    expect(controller.state().font.status).toBe("loaded");
  });

  it("S3: selects every system choice", () => {
    const { controller } = setup();
    controller.open(SUBJECT);
    controller.select("sans");
    controller.select("mono");
    expect(controller.state().choice).toBe("mono");
  });

  it("S5: a store error is unavailable, and choices still work, then retry reloads", async () => {
    const { controller, loader } = setup("ok");
    controller.open(SUBJECT);
    loader.fonts[0]!.resolve({ status: "error", error: "unavailable" });
    await flush();
    expect(controller.state().font).toEqual({ status: "error", error: "unavailable" });
    controller.select("sans");
    expect(controller.state().choice).toBe("sans");
    controller.retry();
    expect(controller.state().font.status).toBe("loading");
    loader.fonts[1]!.resolve(loadedFont(10));
    await flush();
    expect(controller.state().font.status).toBe("loaded");
  });

  it("maps too-large to unavailable", async () => {
    const { controller, loader } = setup();
    controller.open(SUBJECT);
    loader.fonts[0]!.resolve({ status: "error", error: "too-large" });
    await flush();
    expect(controller.state().font).toEqual({ status: "error", error: "unavailable" });
  });

  it("S6: a refused font is unsupported", async () => {
    const { controller, loader } = setup("fail");
    controller.open(SUBJECT);
    loader.fonts[0]!.resolve(loadedFont(10, { format: "eot" }));
    await flush();
    expect(controller.state().font).toEqual({ status: "error", error: "unsupported" });
  });

  it("retry does nothing outside error", async () => {
    const { controller, loader } = setup();
    controller.open(SUBJECT);
    controller.retry();
    expect(loader.fonts).toHaveLength(1);
  });

  it("S7: close releases the registered font, once", async () => {
    const { controller, loader, registrations } = setup("ok");
    controller.open(SUBJECT);
    loader.fonts[0]!.resolve(loadedFont(10));
    await flush();
    controller.close();
    controller.close();
    expect(registrations[0]!.released).toBe(1);
    expect(controller.state().open).toBe(false);
  });

  it("S9: close while the store loads registers nothing", async () => {
    const { controller, loader, registrations } = setup("ok");
    controller.open(SUBJECT);
    controller.close();
    loader.fonts[0]!.resolve(loadedFont(10));
    await flush();
    expect(registrations).toHaveLength(0);
    expect(controller.state().open).toBe(false);
  });

  it("S9: close while registering releases the late font and changes nothing", async () => {
    const { controller, loader, registrations, succeed, states } = setup();
    controller.open(SUBJECT);
    loader.fonts[0]!.resolve(loadedFont(10));
    await flush();
    controller.close();
    const count = states.length;
    succeed(0);
    await flush();
    expect(registrations[0]!.released).toBe(1);
    expect(states).toHaveLength(count);
    expect(controller.state().font.status).toBe("idle");
  });

  it("a late result of an older opening is released", async () => {
    const { controller, loader, registrations, succeed } = setup();
    controller.open(SUBJECT);
    loader.fonts[0]!.resolve(loadedFont(10));
    await flush();
    controller.close();
    controller.open(SUBJECT);
    // cached by the store now: reopening registers again
    await flush();
    succeed(0);
    await flush();
    expect(registrations[0]!.released).toBe(1);
    succeed(1);
    await flush();
    expect(controller.state().font.status).toBe("loaded");
    expect(registrations[1]!.released).toBe(0);
  });

  it("ignores a second open while open", () => {
    const { controller, loader } = setup();
    controller.open(SUBJECT);
    controller.open({ ...SUBJECT, url: "https://x.test/other.woff2" });
    expect(controller.state().subject?.url).toBe(SUBJECT.url);
    expect(loader.fonts).toHaveLength(1);
  });

  it("reopens a cached font without calling the store loader, still registering", async () => {
    const { controller, loader, registrations } = setup("ok");
    controller.open(SUBJECT);
    loader.fonts[0]!.resolve(loadedFont(10));
    await flush();
    controller.close();
    controller.open(SUBJECT);
    await flush();
    expect(loader.fonts).toHaveLength(1);
    expect(registrations).toHaveLength(2);
    expect(controller.state().font.status).toBe("loaded");
  });

  it("select is ignored when closed", () => {
    const { controller } = setup();
    controller.select("mono");
    expect(controller.state().choice).toBe("downloaded");
  });

  it("types: info is PreviewFontInfo", async () => {
    const r: PreviewFileResult<PreviewFontInfo> = loadedFont(1);
    expect(r.status).toBe("loaded");
  });
});
