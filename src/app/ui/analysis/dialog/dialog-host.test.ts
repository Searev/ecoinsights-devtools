import { describe, expect, it, vi } from "vitest";
import { ComparisonSubject } from "../../../domain/models/image-variants";
import { PreviewSubject } from "../../../domain/models/file-preview";
import { DialogRequest, createDialogHost, dialogKey, dialogTitle } from "./dialog-host";
import { displayImageName } from "../image-name";

const comparison = (url = "https://x.org/a/hero.jpg"): DialogRequest => ({
  kind: "comparison",
  subject: { url } as unknown as ComparisonSubject,
});
const preview = (url = "https://x.org/b/clip.mp4"): DialogRequest => ({
  kind: "preview",
  subject: { kind: "font", url, ruleId: "r", declaredType: "" } as PreviewSubject,
});

describe("createDialogHost", () => {
  it("starts closed", () => {
    expect(createDialogHost().state()).toEqual({ open: false, opening: 0 });
  });

  it("opens with the request and key and increments opening", () => {
    const host = createDialogHost();
    const request = comparison();
    expect(host.open(request, "r|u")).toBe(true);
    expect(host.state()).toEqual({ open: true, request, key: "r|u", opening: 1 });
  });

  it("refuses a second open while open (double click)", () => {
    const host = createDialogHost();
    host.open(comparison(), "k1");
    expect(host.open(preview(), "k2")).toBe(false);
    expect(host.state().key).toBe("k1");
    expect(host.state().opening).toBe(1);
  });

  it("closes idempotently and notifies once", () => {
    const host = createDialogHost();
    const listener = vi.fn();
    host.open(preview());
    host.subscribe(listener);
    host.close();
    host.close();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(host.state().open).toBe(false);
    expect(host.state().request).toBeUndefined();
    expect(host.state().opening).toBe(1);
  });

  it("can reopen after close with a new opening number", () => {
    const host = createDialogHost();
    host.open(comparison());
    host.close();
    expect(host.open(preview())).toBe(true);
    expect(host.state().opening).toBe(2);
    expect(host.state().key).toBeUndefined();
  });

  it("stops notifying after unsubscribe", () => {
    const host = createDialogHost();
    const listener = vi.fn();
    const off = host.subscribe(listener);
    off();
    host.open(comparison());
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("dialogKey and dialogTitle", () => {
  it("joins rule and url", () => {
    expect(dialogKey("UseLazyLoading", "https://x.org/a.png")).toBe("UseLazyLoading|https://x.org/a.png");
  });

  it("titles with the display name of the url", () => {
    expect(dialogTitle(comparison("https://x.org/a/hero.jpg"))).toEqual(displayImageName("https://x.org/a/hero.jpg"));
    expect(dialogTitle(preview("https://x.org/b/clip.mp4"))).toEqual(displayImageName("https://x.org/b/clip.mp4"));
  });
});
