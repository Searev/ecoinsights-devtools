/**
 * State machine of the font preview (US-018, ARCH-DECISION-021/023). Pure: the file store and the
 * font registry are injected. The system choices never depend on the downloaded font's state.
 */
import { FontPreviewSubject, PreviewFileResult, PreviewFileStore, PreviewFontInfo } from "../../../domain/models/file-preview";
import { FontChoiceId, FontError } from "./font-preview-format";
import { FontRegistry } from "./font-registry";

export type FontState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; family: string; info: PreviewFontInfo }
  | { status: "error"; error: FontError };

export interface FontPreviewState {
  open: boolean;
  subject?: FontPreviewSubject;
  choice: FontChoiceId;
  font: FontState;
}

export interface FontPreviewController {
  state(): FontPreviewState;
  subscribe(listener: (state: FontPreviewState) => void): () => void;
  open(subject: FontPreviewSubject): void;
  select(choice: FontChoiceId): void;
  retry(): void;
  close(): void;
}

const CLOSED: FontPreviewState = { open: false, choice: "downloaded", font: { status: "idle" } };

export function createFontPreviewController(deps: {
  store: PreviewFileStore;
  fonts: FontRegistry;
}): FontPreviewController {
  const { store, fonts } = deps;
  let current: FontPreviewState = CLOSED;
  /** Incremented on every open and close: results of an older opening are ignored. */
  let epoch = 0;
  let release: (() => void) | undefined;
  const listeners = new Set<(state: FontPreviewState) => void>();

  function update(patch: Partial<FontPreviewState>): void {
    current = { ...current, ...patch };
    for (const listener of Array.from(listeners)) listener(current);
  }

  async function register(result: PreviewFileResult<PreviewFontInfo>, opening: number): Promise<void> {
    if (result.status === "error") {
      update({ font: { status: "error", error: "unavailable" } });
      return;
    }
    const registered = await fonts.register(result.bytes);
    if (opening !== epoch) {
      // Closed (or reopened) meanwhile: nothing may stay registered.
      if (registered.ok) registered.release();
      return;
    }
    if (!registered.ok) {
      update({ font: { status: "error", error: "unsupported" } });
      return;
    }
    release = registered.release;
    update({ font: { status: "loaded", family: registered.family, info: result.info } });
  }

  function load(): void {
    const subject = current.subject!;
    const opening = epoch;
    update({ font: { status: "loading" } });
    const cached = store.peekFont(subject.url);
    if (cached !== undefined) {
      void register(cached, opening);
      return;
    }
    void store.font(subject.url, subject.declaredType).then((result) => {
      if (opening !== epoch) return;
      return register(result, opening);
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
      current = { open: true, subject, choice: "downloaded", font: { status: "idle" } };
      load();
    },
    select(choice) {
      if (!current.open) return;
      update({ choice });
    },
    retry() {
      if (!current.open || current.font.status !== "error") return;
      load();
    },
    close() {
      if (!current.open) return;
      epoch++;
      release?.();
      release = undefined;
      current = CLOSED;
      for (const listener of Array.from(listeners)) listener(current);
    },
  };
}
