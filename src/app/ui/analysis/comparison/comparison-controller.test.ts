import { describe, expect, it } from "vitest";
import { estimationKey, EstimationJob } from "../../../domain/models/image-estimation";
import {
  ComparisonSubject,
  ImageFileResult,
  ImageVariantStore,
} from "../../../domain/models/image-variants";
import {
  Deferred,
  deferred,
  flush,
  loadedFile,
} from "../../../domain/image-comparison/testing/fake-variant-generator";
import { ComparisonState, createComparisonController } from "./comparison-controller";

const RESIZE_JOB: EstimationJob = {
  url: "https://x.test/photo.jpg",
  declaredType: "image/jpeg",
  transform: { kind: "resize", width: 600, height: 400 },
};
const AVIF_JOB: EstimationJob = {
  url: "https://x.test/photo.jpg",
  declaredType: "image/jpeg",
  transform: { kind: "convert" },
};

function subject(o: Partial<ComparisonSubject> = {}): ComparisonSubject {
  return {
    url: "https://x.test/photo.jpg",
    declaredType: "image/jpeg",
    ruleId: "r",
    recordedBytes: 240_000,
    recordedSourceBytes: 240_000,
    natural: { width: 1200, height: 800 },
    display: { width: 300, height: 200 },
    versions: [
      { id: "original", label: "Originale" },
      { id: "resized", label: "Redimensionnée", job: RESIZE_JOB },
      { id: "converted", label: "AVIF", job: AVIF_JOB },
    ],
    ...o,
  };
}

/** Fake store: each network call waits for the test; `cache` feeds the peek methods. */
class FakeStore implements ImageVariantStore {
  readonly originalCalls: Array<Deferred<ImageFileResult>> = [];
  readonly variantCalls: Array<{ job: EstimationJob } & Deferred<ImageFileResult>> = [];
  readonly cache = new Map<string, ImageFileResult>();
  original(): Promise<ImageFileResult> {
    const d = deferred<ImageFileResult>();
    this.originalCalls.push(d);
    return d.promise;
  }
  variant(job: EstimationJob): Promise<ImageFileResult> {
    const d = deferred<ImageFileResult>();
    this.variantCalls.push({ job, ...d });
    return d.promise;
  }
  peekOriginal(url: string): ImageFileResult | undefined {
    return this.cache.get(`o:${url}`);
  }
  peekVariant(job: EstimationJob): ImageFileResult | undefined {
    return this.cache.get(`v:${estimationKey(job)}`);
  }
}

function setup() {
  const store = new FakeStore();
  const created: string[] = [];
  const revoked: string[] = [];
  const objectUrls = {
    create: (_bytes: Uint8Array, mimeType: string) => {
      const url = `blob:${created.length}:${mimeType}`;
      created.push(url);
      return url;
    },
    revoke: (url: string) => void revoked.push(url),
  };
  const controller = createComparisonController({ store, objectUrls });
  const states: ComparisonState[] = [];
  controller.subscribe((s) => states.push(s));
  return { store, controller, created, revoked, states };
}

const error = (e: "original-unavailable" | "generation-failed"): ImageFileResult => ({
  status: "error",
  error: e,
});

describe("createComparisonController", () => {
  it("S1: opens on the original, loading then loaded with its info", async () => {
    const { store, controller } = setup();
    controller.open(subject());
    expect(controller.state()).toMatchObject({
      open: true,
      selected: "original",
      mode: "page",
      versions: { original: { status: "loading" } },
    });
    store.originalCalls[0].resolve(loadedFile(240_000));
    await flush();
    const v = controller.state().versions.original;
    expect(v).toMatchObject({ status: "loaded", info: { byteLength: 240_000 } });
  });

  it("S1/S2: selecting a variant loads it, and the toggle stays usable while loading", async () => {
    const { store, controller } = setup();
    controller.open(subject());
    controller.select("resized");
    expect(controller.state().selected).toBe("resized");
    expect(controller.state().versions.resized).toEqual({ status: "loading" });
    controller.select("original");
    expect(controller.state().selected).toBe("original");
    expect(controller.state().versions.original).toEqual({ status: "loading" });
    controller.select("resized");
    expect(store.variantCalls).toHaveLength(1);
    store.variantCalls[0].resolve(loadedFile(70_000, { width: 600, height: 400 }));
    await flush();
    expect(controller.state().versions.resized).toMatchObject({
      status: "loaded",
      info: { width: 600, height: 400 },
    });
  });

  it("S15: a double open opens one dialog", () => {
    const { store, controller, states } = setup();
    controller.open(subject());
    const count = states.length;
    controller.open(subject({ url: "https://x.test/other.jpg" }));
    expect(store.originalCalls).toHaveLength(1);
    expect(controller.state().subject?.url).toBe("https://x.test/photo.jpg");
    expect(states).toHaveLength(count);
  });

  it("S8: cached versions are loaded synchronously without a store call", () => {
    const { store, controller } = setup();
    store.cache.set("o:https://x.test/photo.jpg", loadedFile(240_000));
    store.cache.set(`v:${estimationKey(AVIF_JOB)}`, loadedFile(96_000, { format: "avif", mimeType: "image/avif" }));
    controller.open(subject());
    expect(controller.state().versions.original?.status).toBe("loaded");
    controller.select("converted");
    expect(controller.state().versions.converted).toMatchObject({ status: "loaded" });
    expect(store.originalCalls).toHaveLength(0);
    expect(store.variantCalls).toHaveLength(0);
  });

  it("S9: an original error shows on the original, variants show the store's error", async () => {
    const { store, controller } = setup();
    controller.open(subject());
    store.originalCalls[0].resolve(error("original-unavailable"));
    await flush();
    expect(controller.state().versions.original).toMatchObject({
      status: "error",
      error: "original-unavailable",
    });
    expect(controller.state().versions.resized).toBeUndefined();
    controller.select("resized");
    store.variantCalls[0].resolve(error("original-unavailable"));
    await flush();
    expect(controller.state().versions.resized).toMatchObject({
      status: "error",
      error: "original-unavailable",
    });
  });

  it("S10: a failed variant is retried alone and the original is unaffected", async () => {
    const { store, controller } = setup();
    controller.open(subject());
    store.originalCalls[0].resolve(loadedFile(240_000));
    await flush();
    controller.select("converted");
    store.variantCalls[0].resolve(error("generation-failed"));
    await flush();
    expect(controller.state().versions.converted).toMatchObject({
      status: "error",
      error: "generation-failed",
    });
    controller.retry("converted");
    expect(controller.state().versions.converted).toEqual({ status: "loading" });
    expect(store.originalCalls).toHaveLength(1);
    store.variantCalls[1].resolve(loadedFile(96_000, { format: "avif", mimeType: "image/avif" }));
    await flush();
    expect(controller.state().versions.converted?.status).toBe("loaded");
    expect(controller.state().versions.original?.status).toBe("loaded");
  });

  it("S11: changed and referenceBytes come from the loaded original", async () => {
    const { store, controller } = setup();
    controller.open(subject());
    expect(controller.state().changed).toBe(false);
    store.originalCalls[0].resolve(loadedFile(180_000));
    await flush();
    expect(controller.state().changed).toBe(true);
    expect(controller.state().referenceBytes).toBe(180_000);
  });

  it("S11: an unchanged original keeps the recorded weight as reference", async () => {
    const { store, controller } = setup();
    controller.open(subject());
    store.originalCalls[0].resolve(loadedFile(240_000));
    await flush();
    expect(controller.state().changed).toBe(false);
    expect(controller.state().referenceBytes).toBe(240_000);
  });

  it("display failure: displayFailed flags the version and retry re-creates the object URL", async () => {
    const { store, controller, created, revoked } = setup();
    controller.open(subject());
    store.originalCalls[0].resolve(loadedFile(240_000));
    await flush();
    expect(created).toHaveLength(1);
    controller.displayFailed("original");
    expect(controller.state().versions.original).toMatchObject({
      status: "error",
      error: "display-failed",
    });
    expect(revoked).toEqual([created[0]]);
    store.cache.set("o:https://x.test/photo.jpg", loadedFile(240_000));
    controller.retry("original");
    expect(created).toHaveLength(2);
    expect(controller.state().versions.original).toMatchObject({
      status: "loaded",
      objectUrl: created[1],
    });
  });

  it("display failure: retry reloads through the store when the cache lost the bytes", async () => {
    const { store, controller, created } = setup();
    controller.open(subject());
    store.originalCalls[0].resolve(loadedFile(240_000));
    await flush();
    controller.displayFailed("original");
    controller.retry("original");
    expect(controller.state().versions.original).toEqual({ status: "loading" });
    store.originalCalls[1].resolve(loadedFile(240_000));
    await flush();
    expect(created).toHaveLength(2);
    expect(controller.state().versions.original?.status).toBe("loaded");
  });

  it("S14: closing during a generation shows no error, creates no URL, revokes each URL once", async () => {
    const { store, controller, created, revoked } = setup();
    controller.open(subject());
    store.originalCalls[0].resolve(loadedFile(240_000));
    await flush();
    controller.select("resized");
    controller.close();
    expect(controller.state().open).toBe(false);
    expect(revoked).toEqual([created[0]]);
    store.variantCalls[0].resolve(loadedFile(70_000));
    await flush();
    expect(created).toHaveLength(1);
    expect(revoked).toHaveLength(1);
    expect(controller.state()).toMatchObject({ open: false, versions: {} });
  });

  it("S14: a late result of an earlier opening does not leak into the next one", async () => {
    const { store, controller, created } = setup();
    controller.open(subject());
    controller.close();
    controller.open(subject());
    store.originalCalls[0].resolve(loadedFile(1));
    await flush();
    expect(created).toHaveLength(0);
    expect(controller.state().versions.original).toEqual({ status: "loading" });
    store.originalCalls[1].resolve(loadedFile(240_000));
    await flush();
    expect(created).toHaveLength(1);
  });

  it("S8/S14: reopening after a completed generation serves the cached version", async () => {
    const { store, controller } = setup();
    controller.open(subject());
    controller.close();
    store.cache.set("o:https://x.test/photo.jpg", loadedFile(240_000));
    store.cache.set(`v:${estimationKey(RESIZE_JOB)}`, loadedFile(70_000));
    controller.open(subject());
    controller.select("resized");
    expect(controller.state().versions.resized?.status).toBe("loaded");
  });

  it("S13: close resets the state and lets the dialog open again", () => {
    const { controller } = setup();
    controller.open(subject());
    controller.close();
    expect(controller.state().open).toBe(false);
    expect(controller.state().subject).toBeUndefined();
    controller.open(subject());
    expect(controller.state().open).toBe(true);
  });

  it("S6: a not-displayed subject opens in native mode and ignores setNativeSize(false)", () => {
    const { controller } = setup();
    controller.open(subject({ display: { width: 0, height: 0 } }));
    expect(controller.state().mode).toBe("native");
    controller.setNativeSize(false);
    expect(controller.state().mode).toBe("native");
  });

  it("S5: setNativeSize switches the mode of a displayed subject", () => {
    const { controller } = setup();
    controller.open(subject());
    controller.setNativeSize(true);
    expect(controller.state().mode).toBe("native");
    controller.setNativeSize(false);
    expect(controller.state().mode).toBe("page");
  });

  it("unsubscribe stops notifications", () => {
    const { controller, states } = setup();
    const extra: ComparisonState[] = [];
    const off = controller.subscribe((s) => extra.push(s));
    off();
    controller.open(subject());
    expect(extra).toHaveLength(0);
    expect(states.length).toBeGreaterThan(0);
  });
});
