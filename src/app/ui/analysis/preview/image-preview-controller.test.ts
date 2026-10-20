import { describe, expect, it } from "vitest";
import { createPreviewFileStore } from "../../../domain/file-preview/preview-store";
import {
  FakePreviewFileLoader,
  flush,
  loadedImage,
} from "../../../domain/file-preview/testing/fake-preview-file-loader";
import { ImagePreviewSubject } from "../../../domain/models/file-preview";
import { createImagePreviewController } from "./image-preview-controller";

const URL1 = "https://x.test/hero.jpg";
function subject(o: Partial<ImagePreviewSubject> = {}): ImagePreviewSubject {
  return { kind: "image", url: URL1, ruleId: "r", declaredType: "image/jpeg", display: { width: 600, height: 400 }, ...o };
}

function setup() {
  const loader = new FakePreviewFileLoader();
  const store = createPreviewFileStore(loader);
  const created: string[] = [];
  const revoked: string[] = [];
  const objectUrls = {
    create: (_b: Uint8Array, mime: string) => {
      const url = `blob:${created.length}:${mime}`;
      created.push(url);
      return url;
    },
    revoke: (url: string) => void revoked.push(url),
  };
  const controller = createImagePreviewController({ store, objectUrls });
  const statuses: string[] = [];
  controller.subscribe((s) => statuses.push(s.content.status));
  return { loader, store, controller, created, revoked, statuses };
}

describe("createImagePreviewController", () => {
  it("scenario 1: loads the image in page mode", async () => {
    const { loader, controller, created } = setup();
    controller.open(subject());
    expect(controller.state()).toMatchObject({ open: true, mode: "page", content: { status: "loading" } });
    expect(loader.images[0]).toMatchObject({ url: URL1, declaredType: "image/jpeg" });
    loader.images[0].resolve(loadedImage(180_000));
    await flush();
    const content = controller.state().content;
    expect(content).toMatchObject({ status: "loaded", objectUrl: created[0] });
    expect(created).toEqual(["blob:0:image/jpeg"]);
  });

  it("scenario 4: not displayed opens in native mode", () => {
    const { controller } = setup();
    controller.open(subject({ display: { width: 0, height: 0 } }));
    expect(controller.state().mode).toBe("native");
    controller.setNativeSize(false);
    expect(controller.state().mode).toBe("native");
  });

  it("toggles the native size when displayed", () => {
    const { controller } = setup();
    controller.open(subject());
    controller.setNativeSize(true);
    expect(controller.state().mode).toBe("native");
    controller.setNativeSize(false);
    expect(controller.state().mode).toBe("page");
  });

  it("scenario 8: error then retry loads", async () => {
    const { loader, controller } = setup();
    controller.open(subject());
    loader.images[0].resolve({ status: "error", error: "unavailable" });
    await flush();
    expect(controller.state().content).toEqual({ status: "error", error: "unavailable" });
    controller.retry();
    expect(controller.state().content.status).toBe("loading");
    loader.images[1].resolve(loadedImage(10));
    await flush();
    expect(controller.state().content.status).toBe("loaded");
  });

  it("retry is ignored outside error", () => {
    const { loader, controller } = setup();
    controller.open(subject());
    controller.retry();
    expect(loader.images).toHaveLength(1);
  });

  it("scenario 9: too-large is an error and creates no URL", async () => {
    const { loader, controller, created } = setup();
    controller.open(subject());
    loader.images[0].resolve({ status: "error", error: "too-large" });
    await flush();
    expect(controller.state().content).toEqual({ status: "error", error: "too-large" });
    expect(created).toEqual([]);
  });

  it("scenario 10: a cached image is loaded at once, never loading", async () => {
    const { loader, controller, statuses } = setup();
    controller.open(subject());
    loader.images[0].resolve(loadedImage(10));
    await flush();
    controller.close();
    statuses.length = 0;
    controller.open(subject());
    expect(controller.state().content.status).toBe("loaded");
    expect(statuses).not.toContain("loading");
    expect(loader.images).toHaveLength(1);
  });

  it("scenario 12: a late result after close creates no object URL", async () => {
    const { loader, controller, created } = setup();
    controller.open(subject());
    controller.close();
    loader.images[0].resolve(loadedImage(10));
    await flush();
    expect(created).toEqual([]);
    expect(controller.state().open).toBe(false);
  });

  it("ignores a late result of an older opening", async () => {
    const { loader, controller, created } = setup();
    controller.open(subject({ url: "https://x.test/a.jpg" }));
    controller.close();
    controller.open(subject({ url: "https://x.test/b.jpg" }));
    loader.images[0].resolve(loadedImage(10));
    await flush();
    expect(created).toEqual([]);
    expect(controller.state().content.status).toBe("loading");
  });

  it("ignores a second open while open", () => {
    const { loader, controller } = setup();
    controller.open(subject());
    controller.open(subject({ url: "https://x.test/other.jpg" }));
    expect(controller.state().subject?.url).toBe(URL1);
    expect(loader.images).toHaveLength(1);
  });

  it("display failed revokes the URL, then retry reloads", async () => {
    const { loader, controller, created, revoked } = setup();
    controller.open(subject());
    loader.images[0].resolve(loadedImage(10));
    await flush();
    controller.displayFailed();
    expect(revoked).toEqual([created[0]]);
    expect(controller.state().content).toEqual({ status: "error", error: "display-failed" });
    controller.retry();
    // the store has it cached: loaded again with a new URL
    expect(controller.state().content.status).toBe("loaded");
    expect(created).toHaveLength(2);
  });

  it("displayFailed is ignored when not loaded", () => {
    const { controller } = setup();
    controller.open(subject());
    controller.displayFailed();
    expect(controller.state().content.status).toBe("loading");
  });

  it("close revokes every URL and is idempotent", async () => {
    const { loader, controller, created, revoked } = setup();
    controller.open(subject());
    loader.images[0].resolve(loadedImage(10));
    await flush();
    controller.close();
    controller.close();
    expect(revoked).toEqual([created[0]]);
    expect(controller.state().open).toBe(false);
  });

  it("decoded stores the natural size only for a raster without size", async () => {
    const { loader, controller } = setup();
    controller.open(subject());
    loader.images[0].resolve(loadedImage(10, { width: undefined, height: undefined }));
    await flush();
    controller.decoded(64, 32);
    expect(controller.state().content).toMatchObject({ decoded: { width: 64, height: 32 } });
  });

  it("decoded is ignored when the info has a size or the image is a vector", async () => {
    const a = setup();
    a.controller.open(subject());
    a.loader.images[0].resolve(loadedImage(10));
    await flush();
    a.controller.decoded(5, 5);
    expect(a.controller.state().content).not.toHaveProperty("decoded");

    const b = setup();
    b.controller.open(subject());
    b.loader.images[0].resolve(
      loadedImage(10, { format: "svg", vector: true, width: undefined, height: undefined, mimeType: "image/svg+xml" })
    );
    await flush();
    b.controller.decoded(300, 150);
    expect(b.controller.state().content).not.toHaveProperty("decoded");
  });
});
