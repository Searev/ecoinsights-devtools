import { describe, expect, it } from "vitest";
import { EstimationJob } from "../models/image-estimation";
import { ImageFileResult } from "../models/image-variants";
import { FakeVariantGenerator, flush, loadedFile } from "./testing/fake-variant-generator";
import { createImageVariantStore } from "./variant-store";

const URL_A = "https://x.test/a.jpg";
const resizeJob = (url = URL_A): EstimationJob => ({
  url,
  declaredType: "image/jpeg",
  transform: { kind: "resize", width: 600, height: 400 },
});
const convertJob = (url = URL_A): EstimationJob => ({
  url,
  declaredType: "image/jpeg",
  transform: { kind: "convert" },
});
const failure = (error: "original-unavailable" | "generation-failed"): ImageFileResult => ({
  status: "error",
  error,
  message: "boom",
});

function setup(maxBytes?: number) {
  const gen = new FakeVariantGenerator();
  const store = createImageVariantStore(gen, maxBytes === undefined ? undefined : { maxBytes });
  return { gen, store };
}

describe("original()", () => {
  it("loads once, then serves the cache without calling the generator", async () => {
    const { gen, store } = setup();
    const first = store.original(URL_A, "image/jpeg");
    gen.loads[0].resolve(loadedFile(1000));
    expect((await first).status).toBe("loaded");
    const second = await store.original(URL_A, "image/jpeg");
    expect(second.status).toBe("loaded");
    expect(gen.loads).toHaveLength(1);
    expect(gen.loads[0]).toMatchObject({ url: URL_A, declaredType: "image/jpeg" });
  });

  it("shares one load between concurrent calls", async () => {
    const { gen, store } = setup();
    const p1 = store.original(URL_A, "image/jpeg");
    const p2 = store.original(URL_A, "image/jpeg");
    expect(gen.loads).toHaveLength(1);
    gen.loads[0].resolve(loadedFile(1000));
    expect((await p1).status).toBe("loaded");
    expect((await p2).status).toBe("loaded");
  });

  it("never caches an error: the next call retries", async () => {
    const { gen, store } = setup();
    const p1 = store.original(URL_A, "image/jpeg");
    gen.loads[0].resolve(failure("original-unavailable"));
    expect(await p1).toMatchObject({ status: "error", error: "original-unavailable" });
    const p2 = store.original(URL_A, "image/jpeg");
    gen.loads[1].resolve(loadedFile(1000));
    expect((await p2).status).toBe("loaded");
  });

  it("treats a rejecting generator as original-unavailable", async () => {
    const { gen, store } = setup();
    const p = store.original(URL_A, "image/jpeg");
    gen.loads[0].reject(new Error("contract violation"));
    expect(await p).toMatchObject({ status: "error", error: "original-unavailable" });
    expect(store.peekOriginal(URL_A)).toBeUndefined();
  });
});

describe("variant()", () => {
  it("S8: the second call is served from the cache without generating again", async () => {
    const { gen, store } = setup();
    const p1 = store.variant(resizeJob());
    gen.loads[0].resolve(loadedFile(1000));
    await flush();
    gen.generates[0].resolve(loadedFile(300, { width: 600, height: 400 }));
    expect((await p1).status).toBe("loaded");
    const again = await store.variant(resizeJob());
    expect(again).toMatchObject({ status: "loaded", info: { width: 600, height: 400 } });
    expect(gen.generates).toHaveLength(1);
    expect(gen.loads).toHaveLength(1);
  });

  it("passes the original bytes and the job to generate", async () => {
    const { gen, store } = setup();
    const p = store.variant(resizeJob());
    const original = loadedFile(1000);
    gen.loads[0].resolve(original);
    await flush();
    expect(gen.generates[0].job).toEqual(resizeJob());
    expect(original.status === "loaded" && gen.generates[0].original).toBe(original.status === "loaded" ? original.bytes : null);
    gen.generates[0].resolve(loadedFile(300));
    await p;
  });

  it("S14: concurrent calls share one generation", async () => {
    const { gen, store } = setup();
    const p1 = store.variant(resizeJob());
    const p2 = store.variant(resizeJob());
    gen.loads[0].resolve(loadedFile(1000));
    await flush();
    expect(gen.generates).toHaveLength(1);
    gen.generates[0].resolve(loadedFile(300));
    expect((await p1).status).toBe("loaded");
    expect((await p2).status).toBe("loaded");
    expect(gen.loads).toHaveLength(1);
  });

  it("S15: a later call joins a generation still running", async () => {
    const { gen, store } = setup();
    void store.variant(resizeJob());
    gen.loads[0].resolve(loadedFile(1000));
    await flush();
    const late = store.variant(resizeJob());
    expect(gen.generates).toHaveLength(1);
    gen.generates[0].resolve(loadedFile(300));
    expect((await late).status).toBe("loaded");
  });

  it("S14: a generation whose caller went away still fills the cache", async () => {
    const { gen, store } = setup();
    void store.variant(resizeJob());
    gen.loads[0].resolve(loadedFile(1000));
    await flush();
    expect(store.peekVariant(resizeJob())).toBeUndefined();
    gen.generates[0].resolve(loadedFile(300));
    await flush();
    expect(store.peekVariant(resizeJob())?.status).toBe("loaded");
    await store.variant(resizeJob());
    expect(gen.generates).toHaveLength(1);
  });

  it("S9: an original failure gives original-unavailable for every variant without generating", async () => {
    const { gen, store } = setup();
    const p1 = store.variant(resizeJob());
    const p2 = store.variant(convertJob());
    expect(gen.loads).toHaveLength(1);
    gen.loads[0].resolve(failure("original-unavailable"));
    expect(await p1).toMatchObject({ status: "error", error: "original-unavailable" });
    expect(await p2).toMatchObject({ status: "error", error: "original-unavailable" });
    expect(gen.generates).toHaveLength(0);
  });

  it("S7: the original is fetched once for several variants", async () => {
    const { gen, store } = setup();
    const p1 = store.variant(resizeJob());
    const p2 = store.variant(convertJob());
    gen.loads[0].resolve(loadedFile(1000));
    await flush();
    expect(gen.generates.map((g) => g.job.transform.kind)).toEqual(["resize", "convert"]);
    gen.generates[0].resolve(loadedFile(300));
    gen.generates[1].resolve(loadedFile(200));
    await Promise.all([p1, p2]);
    const p3 = store.variant({ ...convertJob(), transform: { kind: "resize-convert", width: 600, height: 400 } });
    await flush();
    expect(gen.loads).toHaveLength(1);
    expect(gen.generates).toHaveLength(3);
    gen.generates[2].resolve(loadedFile(100));
    await p3;
  });

  it("S10: a generation error is not cached, the next call retries and succeeds", async () => {
    const { gen, store } = setup();
    const p1 = store.variant(resizeJob());
    gen.loads[0].resolve(loadedFile(1000));
    await flush();
    gen.generates[0].resolve(failure("generation-failed"));
    expect(await p1).toMatchObject({ status: "error", error: "generation-failed" });
    expect(store.peekVariant(resizeJob())).toBeUndefined();
    const p2 = store.variant(resizeJob());
    await flush();
    expect(gen.generates).toHaveLength(2);
    gen.generates[1].resolve(loadedFile(300));
    expect((await p2).status).toBe("loaded");
    expect(gen.loads).toHaveLength(1);
  });

  it("treats a rejecting generate as generation-failed", async () => {
    const { gen, store } = setup();
    const p = store.variant(resizeJob());
    gen.loads[0].resolve(loadedFile(1000));
    await flush();
    gen.generates[0].reject(new Error("contract violation"));
    expect(await p).toMatchObject({ status: "error", error: "generation-failed" });
  });

  it("caches variants by estimation key: another size is another entry", async () => {
    const { gen, store } = setup();
    const p1 = store.variant(resizeJob());
    gen.loads[0].resolve(loadedFile(1000));
    await flush();
    gen.generates[0].resolve(loadedFile(300));
    await p1;
    const other: EstimationJob = { ...resizeJob(), transform: { kind: "resize", width: 300, height: 200 } };
    void store.variant(other);
    await flush();
    expect(gen.generates).toHaveLength(2);
  });
});

describe("LRU in the store", () => {
  it("evicts under a small maxBytes and reloads an evicted original for the next variant", async () => {
    const { gen, store } = setup(250);
    const URL_B = "https://x.test/b.jpg";
    const p1 = store.variant(resizeJob());
    gen.loads[0].resolve(loadedFile(100));
    await flush();
    gen.generates[0].resolve(loadedFile(100));
    await p1;
    // Loading another original pushes the total to 300 > 250: the oldest entry (original A) goes.
    const pB = store.original(URL_B, "image/jpeg");
    gen.loads[1].resolve(loadedFile(100));
    await pB;
    expect(store.peekOriginal(URL_A)).toBeUndefined();
    expect(store.peekVariant(resizeJob())?.status).toBe("loaded");

    const p2 = store.variant(convertJob());
    expect(gen.loads).toHaveLength(3);
    expect(gen.loads[2].url).toBe(URL_A);
    gen.loads[2].resolve(loadedFile(100));
    await flush();
    gen.generates[1].resolve(loadedFile(50));
    expect((await p2).status).toBe("loaded");
  });

  it("returns a value larger than the cap without caching it", async () => {
    const { gen, store } = setup(50);
    const p = store.original(URL_A, "image/jpeg");
    gen.loads[0].resolve(loadedFile(100));
    expect((await p).status).toBe("loaded");
    expect(store.peekOriginal(URL_A)).toBeUndefined();
  });
});

describe("peek", () => {
  it("S8: returns loaded entries only", async () => {
    const { gen, store } = setup();
    expect(store.peekOriginal(URL_A)).toBeUndefined();
    expect(store.peekVariant(resizeJob())).toBeUndefined();
    const p = store.variant(resizeJob());
    expect(store.peekOriginal(URL_A)).toBeUndefined();
    gen.loads[0].resolve(loadedFile(1000));
    await flush();
    expect(store.peekOriginal(URL_A)?.status).toBe("loaded");
    expect(store.peekVariant(resizeJob())).toBeUndefined();
    gen.generates[0].resolve(failure("generation-failed"));
    await p;
    expect(store.peekVariant(resizeJob())).toBeUndefined();
  });

  it("refreshes the recency of the entry it reads", async () => {
    const { gen, store } = setup(250);
    const p1 = store.original("https://x.test/1.jpg", "image/jpeg");
    gen.loads[0].resolve(loadedFile(100));
    await p1;
    const p2 = store.original("https://x.test/2.jpg", "image/jpeg");
    gen.loads[1].resolve(loadedFile(100));
    await p2;
    store.peekOriginal("https://x.test/1.jpg");
    const p3 = store.original("https://x.test/3.jpg", "image/jpeg");
    gen.loads[2].resolve(loadedFile(100));
    await p3;
    expect(store.peekOriginal("https://x.test/1.jpg")?.status).toBe("loaded");
    expect(store.peekOriginal("https://x.test/2.jpg")).toBeUndefined();
  });
});
