/**
 * State machine of the image preview body (US-015, ARCH-DECISION-021). Pure: no DOM, the object URL
 * factory and the preview file store are injected.
 */
import {
  ImagePreviewSubject,
  PreviewFileError,
  PreviewFileResult,
  PreviewFileStore,
  PreviewImageInfo,
} from "../../../domain/models/file-preview";
import { ObjectUrls } from "../comparison/comparison-controller";
import { DisplayMode, Size } from "../comparison/comparison-layout";
import { initialImageMode, isDisplayedBox } from "./image-preview-layout";

export type ImageContentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; objectUrl: string; info: PreviewImageInfo; decoded?: Size }
  | { status: "error"; error: PreviewFileError | "display-failed" };

export interface ImagePreviewState {
  open: boolean;
  subject?: ImagePreviewSubject;
  mode: DisplayMode;
  content: ImageContentState;
}

export interface ImagePreviewController {
  state(): ImagePreviewState;
  subscribe(listener: (state: ImagePreviewState) => void): () => void;
  open(subject: ImagePreviewSubject): void;
  retry(): void;
  setNativeSize(on: boolean): void;
  /** Natural size reported by the `<img>` once decoded. */
  decoded(width: number, height: number): void;
  displayFailed(): void;
  close(): void;
}

const CLOSED: ImagePreviewState = { open: false, mode: "page", content: { status: "idle" } };

export function createImagePreviewController(deps: {
  store: PreviewFileStore;
  objectUrls: ObjectUrls;
}): ImagePreviewController {
  const { store, objectUrls } = deps;
  let current: ImagePreviewState = CLOSED;
  /** Incremented on every open and close: results of an older opening are ignored. */
  let epoch = 0;
  /** Live object URL of the current opening. */
  let liveUrl: string | undefined;
  const listeners = new Set<(state: ImagePreviewState) => void>();

  function update(patch: Partial<ImagePreviewState>): void {
    current = { ...current, ...patch };
    for (const listener of Array.from(listeners)) listener(current);
  }

  function revokeLive(): void {
    if (liveUrl !== undefined) objectUrls.revoke(liveUrl);
    liveUrl = undefined;
  }

  function apply(result: PreviewFileResult<PreviewImageInfo>): void {
    if (result.status === "error") {
      update({ content: { status: "error", error: result.error } });
      return;
    }
    revokeLive();
    liveUrl = objectUrls.create(result.bytes, result.info.mimeType);
    update({ content: { status: "loaded", objectUrl: liveUrl, info: result.info } });
  }

  function load(): void {
    const subject = current.subject!;
    const cached = store.peekImage(subject.url);
    if (cached !== undefined && cached.status === "loaded") {
      apply(cached);
      return;
    }
    update({ content: { status: "loading" } });
    const opening = epoch;
    void store.image(subject.url, subject.declaredType).then((result) => {
      if (opening !== epoch) return;
      apply(result);
    });
  }

  return {
    state: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    open(subject) {
      if (current.open) return;
      epoch++;
      liveUrl = undefined;
      update({ open: true, subject, mode: initialImageMode(subject), content: { status: "idle" } });
      load();
    },
    retry() {
      if (!current.open || current.content.status !== "error") return;
      load();
    },
    setNativeSize(on) {
      const subject = current.subject;
      if (!current.open || subject === undefined) return;
      if (!on && !isDisplayedBox(subject.display)) return;
      update({ mode: on ? "native" : "page" });
    },
    decoded(width, height) {
      const content = current.content;
      if (!current.open || content.status !== "loaded") return;
      if (content.info.vector || (content.info.width !== undefined && content.info.height !== undefined)) return;
      if (!(width > 0 && height > 0)) return;
      update({ content: { ...content, decoded: { width, height } } });
    },
    displayFailed() {
      if (!current.open || current.content.status !== "loaded") return;
      revokeLive();
      update({ content: { status: "error", error: "display-failed" } });
    },
    close() {
      if (!current.open) return;
      epoch++;
      revokeLive();
      current = CLOSED;
      for (const listener of Array.from(listeners)) listener(current);
    },
  };
}
