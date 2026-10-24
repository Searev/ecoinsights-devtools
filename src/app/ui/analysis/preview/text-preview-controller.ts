/**
 * State machine of the text file preview (US-020, ARCH-DECISION-024). Pure: the file store is
 * injected. Bytes are cached raw by the store and decoded here.
 */
import {
  PreviewFileError,
  PreviewFileResult,
  PreviewFileStore,
  PreviewTextInfo,
  TextPreviewSubject,
} from "../../../domain/models/file-preview";
import { TextDocument, decodePreviewText, prepareTextDocument } from "./text-document";

export type TextContentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; info: PreviewTextInfo; document: TextDocument }
  | { status: "error"; error: PreviewFileError };

export interface TextPreviewState {
  open: boolean;
  subject?: TextPreviewSubject;
  content: TextContentState;
}

export interface TextPreviewController {
  state(): TextPreviewState;
  subscribe(listener: (state: TextPreviewState) => void): () => void;
  open(subject: TextPreviewSubject): void;
  retry(): void;
  close(): void;
}

const CLOSED: TextPreviewState = { open: false, content: { status: "idle" } };

export function createTextPreviewController(deps: { store: PreviewFileStore }): TextPreviewController {
  const { store } = deps;
  let current: TextPreviewState = CLOSED;
  /** Incremented on every open and close: results of an older opening are ignored. */
  let epoch = 0;
  const listeners = new Set<(state: TextPreviewState) => void>();

  function emit(): void {
    for (const listener of Array.from(listeners)) listener(current);
  }

  function settle(result: PreviewFileResult<PreviewTextInfo>): TextContentState {
    if (result.status === "error") return { status: "error", error: result.error };
    const text = decodePreviewText(result.bytes, result.info.charset);
    return { status: "loaded", info: result.info, document: prepareTextDocument(text) };
  }

  function load(): void {
    const subject = current.subject!;
    const opening = epoch;
    const cached = store.peekText(subject.url);
    if (cached !== undefined) {
      current = { ...current, content: settle(cached) };
      emit();
      return;
    }
    current = { ...current, content: { status: "loading" } };
    emit();
    void store.text(subject.url, subject.declaredType, subject.charset).then((result) => {
      if (opening !== epoch) return;
      current = { ...current, content: settle(result) };
      emit();
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
      current = { open: true, subject, content: { status: "idle" } };
      load();
    },
    retry() {
      if (!current.open || current.content.status !== "error") return;
      epoch++;
      load();
    },
    close() {
      if (!current.open) return;
      epoch++;
      current = CLOSED;
      emit();
    },
  };
}
