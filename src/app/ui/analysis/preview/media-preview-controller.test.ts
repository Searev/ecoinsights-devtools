import { describe, expect, it, vi } from "vitest";
import { MediaPreviewSubject } from "../../../domain/models/file-preview";
import { MediaPreviewState, createMediaPreviewController } from "./media-preview-controller";

function video(patch: Partial<MediaPreviewSubject> = {}): MediaPreviewSubject {
  return {
    kind: "media",
    media: "video",
    ruleId: "r",
    url: "https://e.org/intro.mp4",
    mimeType: "video/mp4",
    display: { width: 640, height: 360 },
    ...patch,
  };
}

const playable = (type: string) => (type === "" ? "" : "maybe");

describe("createMediaPreviewController", () => {
  it("starts closed and idle", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    expect(c.state().open).toBe(false);
    expect(c.state().content).toEqual({ status: "idle" });
  });

  it("opens in loading, then loads the metadata (S1)", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    c.open(video());
    expect(c.state()).toMatchObject({ open: true, mode: "page", content: { status: "loading" }, reloads: 0 });
    c.metadataLoaded({ duration: 92, width: 1920, height: 1080 });
    expect(c.state().content).toEqual({
      status: "loaded",
      metadata: { duration: 92, width: 1920, height: 1080 },
    });
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    const seen: MediaPreviewState[] = [];
    const off = c.subscribe((s) => seen.push(s));
    c.open(video());
    expect(seen).toHaveLength(1);
    off();
    c.close();
    expect(seen).toHaveLength(1);
  });

  it("exposes no way to play (S2): only loading and loaded states exist before an error", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    expect(Object.keys(c).sort()).toEqual(
      ["close", "failed", "metadataLoaded", "open", "retry", "setNativeSize", "state", "subscribe"],
    );
  });

  it("ignores a second open while open", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    c.open(video());
    c.open(video({ url: "https://e.org/other.mp4" }));
    expect(c.state().subject?.url).toBe("https://e.org/intro.mp4");
  });

  it("goes unsupported at once when canPlayType refuses a known type (S6)", () => {
    const canPlayType = vi.fn(() => "");
    const c = createMediaPreviewController({ canPlayType });
    c.open(video({ mimeType: "video/x-weird" }));
    expect(canPlayType).toHaveBeenCalledWith("video/x-weird");
    expect(c.state().content).toEqual({ status: "error", error: "unsupported" });
  });

  it("uses the extension type for the pre-check, and skips it when the type is unknown", () => {
    const canPlayType = vi.fn(() => "");
    const c = createMediaPreviewController({ canPlayType });
    c.open(video({ mimeType: undefined }));
    expect(canPlayType).toHaveBeenCalledWith("video/mp4");
    c.close();
    canPlayType.mockClear();
    c.open(video({ mimeType: undefined, url: "https://e.org/stream" }));
    expect(canPlayType).not.toHaveBeenCalled();
    expect(c.state().content.status).toBe("loading");
  });

  it("maps the player error code with the recorded status (S7)", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    c.open(video({ recordedStatus: 404 }));
    c.failed(4);
    expect(c.state().content).toEqual({ status: "error", error: "unavailable" });
  });

  it("reports a code 4 as unsupported when the page got the file", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    c.open(video({ recordedStatus: 200 }));
    c.failed(4);
    expect(c.state().content).toEqual({ status: "error", error: "unsupported" });
  });

  it("reports unavailable without a recorded request or a code", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    c.open(video());
    c.failed(4);
    expect(c.state().content).toEqual({ status: "error", error: "unavailable" });
    c.retry();
    c.failed();
    expect(c.state().content).toEqual({ status: "error", error: "unavailable" });
  });

  it("can fail after the metadata loaded (decode error)", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    c.open(video());
    c.metadataLoaded({ duration: 1 });
    c.failed(3);
    expect(c.state().content).toEqual({ status: "error", error: "unsupported" });
  });

  it("retries from an error: back to loading with a reload", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    c.open(video());
    c.failed(2);
    c.retry();
    expect(c.state().content).toEqual({ status: "loading" });
    expect(c.state().reloads).toBe(1);
  });

  it("retries after a canPlayType error so the body renders the source", () => {
    const c = createMediaPreviewController({ canPlayType: () => "" });
    c.open(video());
    c.retry();
    expect(c.state().content).toEqual({ status: "loading" });
    expect(c.state().reloads).toBe(1);
  });

  it("ignores retry outside an error", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    c.retry();
    c.open(video());
    c.retry();
    expect(c.state().reloads).toBe(0);
    expect(c.state().content.status).toBe("loading");
  });

  it("ignores metadataLoaded outside loading", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    c.metadataLoaded({ duration: 1 });
    expect(c.state().content.status).toBe("idle");
    c.open(video());
    c.failed(2);
    c.metadataLoaded({ duration: 1 });
    expect(c.state().content.status).toBe("error");
  });

  it("ignores late events after close, and close is idempotent", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    c.open(video());
    c.close();
    const closed = c.state();
    c.metadataLoaded({ duration: 3 });
    c.failed(2);
    c.close();
    expect(c.state()).toBe(closed);
    expect(c.state()).toMatchObject({ open: false, content: { status: "idle" } });
  });

  it("opens a box of 0 x 0 or no box in native mode (S9)", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    c.open(video({ display: { width: 0, height: 0 } }));
    expect(c.state().mode).toBe("native");
    c.close();
    c.open(video({ display: undefined }));
    expect(c.state().mode).toBe("native");
  });

  it("toggles the video mode, but not to native-off when not displayed", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    c.open(video());
    c.setNativeSize(true);
    expect(c.state().mode).toBe("native");
    c.setNativeSize(false);
    expect(c.state().mode).toBe("page");
    c.close();
    c.open(video({ display: { width: 0, height: 0 } }));
    c.setNativeSize(false);
    expect(c.state().mode).toBe("native");
  });

  it("gives a sound no mode", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    c.open(video({ media: "audio", url: "https://e.org/j.mp3", mimeType: "audio/mpeg" }));
    expect(c.state().mode).toBe("native");
    c.setNativeSize(false);
    expect(c.state().mode).toBe("native");
  });

  it("can be reopened after close with a fresh state", () => {
    const c = createMediaPreviewController({ canPlayType: playable });
    c.open(video());
    c.failed(2);
    c.retry();
    c.close();
    c.open(video());
    expect(c.state()).toMatchObject({ content: { status: "loading" }, reloads: 0 });
  });
});
