/**
 * State machine of the media preview (US-016, ARCH-DECISION-021/023). Pure: no DOM. It never asks
 * the player to play. The body wires the element events to `metadataLoaded` and `failed`.
 */
import { MediaPreviewSubject } from "../../../domain/models/file-preview";
import { DisplayMode } from "../comparison/comparison-layout";
import { MediaErrorKind, MediaMetadata, effectiveMediaType, mediaErrorKind } from "./media-format";

export type MediaContentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; metadata: MediaMetadata }
  | { status: "error"; error: MediaErrorKind };

export interface MediaPreviewState {
  open: boolean;
  subject?: MediaPreviewSubject;
  mode: DisplayMode;
  content: MediaContentState;
  /** Bumped by `retry()`: the body calls `load()` on the element when it changes. */
  reloads: number;
}

export interface MediaPreviewController {
  state(): MediaPreviewState;
  subscribe(listener: (state: MediaPreviewState) => void): () => void;
  open(subject: MediaPreviewSubject): void;
  metadataLoaded(metadata: MediaMetadata): void;
  failed(code?: number): void;
  retry(): void;
  setNativeSize(on: boolean): void;
  close(): void;
}

const CLOSED: MediaPreviewState = { open: false, mode: "native", content: { status: "idle" }, reloads: 0 };

function isDisplayed(subject: MediaPreviewSubject): boolean {
  return (
    subject.media === "video" &&
    subject.display !== undefined &&
    subject.display.width > 0 &&
    subject.display.height > 0
  );
}

export function createMediaPreviewController(deps: {
  canPlayType: (type: string) => string;
}): MediaPreviewController {
  let current: MediaPreviewState = CLOSED;
  const listeners = new Set<(state: MediaPreviewState) => void>();

  function update(patch: Partial<MediaPreviewState>): void {
    current = { ...current, ...patch };
    for (const listener of Array.from(listeners)) listener(current);
  }

  return {
    state: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open(subject) {
      if (current.open) return;
      const type = effectiveMediaType(subject);
      const refused = type !== undefined && deps.canPlayType(type) === "";
      current = CLOSED;
      update({
        open: true,
        subject,
        mode: isDisplayed(subject) ? "page" : "native",
        content: refused ? { status: "error", error: "unsupported" } : { status: "loading" },
        reloads: 0,
      });
    },
    metadataLoaded(metadata) {
      if (!current.open || current.content.status !== "loading") return;
      update({ content: { status: "loaded", metadata } });
    },
    failed(code) {
      if (!current.open || current.content.status === "idle") return;
      update({
        content: { status: "error", error: mediaErrorKind({ code, recordedStatus: current.subject?.recordedStatus }) },
      });
    },
    retry() {
      if (!current.open || current.content.status !== "error") return;
      update({ content: { status: "loading" }, reloads: current.reloads + 1 });
    },
    setNativeSize(on) {
      if (!current.open || current.subject === undefined || current.subject.media !== "video") return;
      if (!on && !isDisplayed(current.subject)) return;
      update({ mode: on ? "native" : "page" });
    },
    close() {
      if (!current.open) return;
      update({ ...CLOSED });
    },
  };
}
