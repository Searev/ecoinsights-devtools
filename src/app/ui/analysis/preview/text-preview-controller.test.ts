import { describe, expect, it } from "vitest";
import { createPreviewFileStore } from "../../../domain/file-preview/preview-store";
import {
  FakePreviewFileLoader,
  flush,
  loadedText,
} from "../../../domain/file-preview/testing/fake-preview-file-loader";
import { TextPreviewSubject } from "../../../domain/models/file-preview";
import { TextPreviewState, createTextPreviewController } from "./text-preview-controller";

const SUBJECT: TextPreviewSubject = {
  kind: "text",
  url: "https://x.test/a.css",
  ruleId: "MinifyTextFiles",
  fileType: "CSS",
  declaredType: "text/css",
};

function setup() {
  const loader = new FakePreviewFileLoader();
  const store = createPreviewFileStore(loader);
  const controller = createTextPreviewController({ store });
  const states: TextPreviewState[] = [];
  controller.subscribe((s) => states.push(s));
  return { loader, store, controller, states };
}

describe("text preview controller", () => {
  it("starts closed and idle", () => {
    const { controller } = setup();
    expect(controller.state()).toEqual({ open: false, content: { status: "idle" } });
  });

  it("S1: loading then loaded with info and document", async () => {
    const { controller, loader } = setup();
    controller.open(SUBJECT);
    expect(controller.state().open).toBe(true);
    expect(controller.state().content.status).toBe("loading");
    expect(loader.texts[0]).toMatchObject({ url: SUBJECT.url, declaredType: "text/css" });
    loader.texts[0]!.resolve(loadedText("a {\n  color: red;\n}\n"));
    await flush();
    const content = controller.state().content;
    expect(content.status).toBe("loaded");
    if (content.status === "loaded") {
      expect(content.info.charset).toBe("utf-8");
      expect(content.document.lines).toEqual(["a {", "  color: red;", "}"]);
      expect(content.document.lineCount).toBe(3);
    }
  });

  it("S6: unavailable, then retry loads", async () => {
    const { controller, loader } = setup();
    controller.open(SUBJECT);
    loader.texts[0]!.resolve({ status: "error", error: "unavailable" });
    await flush();
    expect(controller.state().content).toEqual({ status: "error", error: "unavailable" });
    controller.retry();
    expect(controller.state().content.status).toBe("loading");
    loader.texts[1]!.resolve(loadedText("a{}"));
    await flush();
    expect(controller.state().content.status).toBe("loaded");
  });

  it("too-large is an error", async () => {
    const { controller, loader } = setup();
    controller.open(SUBJECT);
    loader.texts[0]!.resolve({ status: "error", error: "too-large" });
    await flush();
    expect(controller.state().content).toEqual({ status: "error", error: "too-large" });
  });

  it("S11: passes the charset to the store and decodes with info.charset", async () => {
    const { controller, loader } = setup();
    controller.open({ ...SUBJECT, charset: "iso-8859-1" });
    expect(loader.texts[0]!.charset).toBe("iso-8859-1");
    loader.texts[0]!.resolve({
      status: "loaded",
      bytes: new Uint8Array([0x6c, 0xe9]),
      info: { byteLength: 2, mimeType: "text/css", charset: "iso-8859-1" },
    });
    await flush();
    const content = controller.state().content;
    expect(content.status === "loaded" && content.document.lines).toEqual(["lé"]);
  });

  it("S13: close while loading ignores the late result, then reopening is loaded at once", async () => {
    const { controller, loader, states } = setup();
    controller.open(SUBJECT);
    controller.close();
    expect(controller.state()).toEqual({ open: false, content: { status: "idle" } });
    const count = states.length;
    loader.texts[0]!.resolve(loadedText("a{}"));
    await flush();
    expect(states).toHaveLength(count);
    expect(controller.state().open).toBe(false);

    const before = states.length;
    controller.open(SUBJECT);
    expect(controller.state().content.status).toBe("loaded");
    expect(states.slice(before).some((s) => s.content.status === "loading")).toBe(false);
    expect(loader.texts).toHaveLength(1);
  });

  it("a late result of an older opening does not replace the new one", async () => {
    const { controller, loader } = setup();
    controller.open(SUBJECT);
    controller.close();
    controller.open({ ...SUBJECT, url: "https://x.test/b.css" });
    loader.texts[0]!.resolve(loadedText("old"));
    await flush();
    expect(controller.state().content.status).toBe("loading");
    loader.texts[1]!.resolve(loadedText("new"));
    await flush();
    const content = controller.state().content;
    expect(content.status === "loaded" && content.document.lines).toEqual(["new"]);
  });

  it("S14: empty content is loaded with 0 lines", async () => {
    const { controller, loader } = setup();
    controller.open(SUBJECT);
    loader.texts[0]!.resolve(loadedText(""));
    await flush();
    const content = controller.state().content;
    expect(content.status).toBe("loaded");
    if (content.status === "loaded") {
      expect(content.document.lineCount).toBe(0);
      expect(content.info.byteLength).toBe(0);
    }
  });

  it("ignores a second open while open", () => {
    const { controller, loader } = setup();
    controller.open(SUBJECT);
    controller.open({ ...SUBJECT, url: "https://x.test/other.css" });
    expect(controller.state().subject?.url).toBe(SUBJECT.url);
    expect(loader.texts).toHaveLength(1);
  });

  it("ignores retry outside error", () => {
    const { controller, loader } = setup();
    controller.retry();
    controller.open(SUBJECT);
    controller.retry();
    expect(loader.texts).toHaveLength(1);
  });

  it("close is idempotent", () => {
    const { controller, states } = setup();
    controller.close();
    expect(states).toHaveLength(0);
    controller.open(SUBJECT);
    controller.close();
    const count = states.length;
    controller.close();
    expect(states).toHaveLength(count);
  });

  it("unsubscribes listeners", () => {
    const loader = new FakePreviewFileLoader();
    const controller = createTextPreviewController({ store: createPreviewFileStore(loader) });
    let calls = 0;
    const off = controller.subscribe(() => void calls++);
    controller.open(SUBJECT);
    const seen = calls;
    expect(seen).toBeGreaterThan(0);
    off();
    controller.close();
    expect(calls).toBe(seen);
  });
});
