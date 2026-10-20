/**
 * State machine of the comparison dialog (US-005, ARCH-DECISION-016). Pure: no DOM, the object URL
 * factory and the variant store are injected.
 */
import {
  hasImageChanged,
  referenceOriginalBytes,
} from "../../../domain/image-comparison/comparison-subject";
import {
  ComparisonSubject,
  ImageFileError,
  ImageFileInfo,
  ImageFileResult,
  ImageVariantStore,
  ImageVersionId,
} from "../../../domain/models/image-variants";
import { DisplayMode, initialMode, isDisplayed } from "./comparison-layout";

export type VersionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; objectUrl: string; info: ImageFileInfo }
  | { status: "error"; error: ImageFileError | "display-failed"; message?: string };

export interface ComparisonState {
  open: boolean;
  subject?: ComparisonSubject;
  selected: ImageVersionId;
  mode: DisplayMode;
  versions: Partial<Record<ImageVersionId, VersionState>>;
  /** Set once the original is loaded: its weight differs from the analysis. */
  changed: boolean;
  /** Set once the original is loaded: the weight every gain is computed against. */
  referenceBytes?: number;
}

export interface ObjectUrls {
  create(bytes: Uint8Array, mimeType: string): string;
  revoke(url: string): void;
}

export interface ComparisonController {
  state(): ComparisonState;
  subscribe(listener: (state: ComparisonState) => void): () => void;
  open(subject: ComparisonSubject): void;
  select(id: ImageVersionId): void;
  retry(id: ImageVersionId): void;
  setNativeSize(on: boolean): void;
  displayFailed(id: ImageVersionId): void;
  close(): void;
}

const CLOSED: ComparisonState = { open: false, selected: "original", mode: "page", versions: {}, changed: false };

export function createComparisonController(deps: {
  store: ImageVariantStore;
  objectUrls: ObjectUrls;
}): ComparisonController {
  const { store, objectUrls } = deps;
  let current: ComparisonState = CLOSED;
  /** Incremented on every open and close: results of an older opening are ignored. */
  let epoch = 0;
  /** Live object URL per version of the current opening. */
  const urls = new Map<ImageVersionId, string>();
  const listeners = new Set<(state: ComparisonState) => void>();

  function update(patch: Partial<ComparisonState>): void {
    current = { ...current, ...patch };
    for (const listener of Array.from(listeners)) listener(current);
  }

  function setVersion(id: ImageVersionId, state: VersionState, patch: Partial<ComparisonState> = {}): void {
    update({ ...patch, versions: { ...current.versions, [id]: state } });
  }

  function peek(subject: ComparisonSubject, id: ImageVersionId): ImageFileResult | undefined {
    if (id === "original") return store.peekOriginal(subject.url);
    const job = subject.versions.find((v) => v.id === id)?.job;
    return job === undefined ? undefined : store.peekVariant(job);
  }

  function request(subject: ComparisonSubject, id: ImageVersionId): Promise<ImageFileResult> {
    if (id === "original") return store.original(subject.url, subject.declaredType);
    return store.variant(subject.versions.find((v) => v.id === id)!.job!);
  }

  function apply(id: ImageVersionId, result: ImageFileResult): void {
    const subject = current.subject!;
    if (result.status === "error") {
      const state: VersionState = { status: "error", error: result.error };
      if (result.message !== undefined) state.message = result.message;
      setVersion(id, state);
      return;
    }
    const previous = urls.get(id);
    if (previous !== undefined) objectUrls.revoke(previous);
    const objectUrl = objectUrls.create(result.bytes, result.info.mimeType);
    urls.set(id, objectUrl);
    const loaded: VersionState = { status: "loaded", objectUrl, info: result.info };
    if (id === "original") {
      setVersion(id, loaded, {
        changed: hasImageChanged(subject, result.info.byteLength),
        referenceBytes: referenceOriginalBytes(subject, result.info.byteLength),
      });
    } else {
      setVersion(id, loaded);
    }
  }

  function load(id: ImageVersionId): void {
    const subject = current.subject!;
    const cached = peek(subject, id);
    if (cached !== undefined && cached.status === "loaded") {
      apply(id, cached);
      return;
    }
    setVersion(id, { status: "loading" });
    const opening = epoch;
    void request(subject, id).then((result) => {
      if (opening !== epoch) return;
      apply(id, result);
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
      urls.clear();
      update({
        open: true,
        subject,
        selected: "original",
        mode: initialMode(subject),
        versions: {},
        changed: false,
        referenceBytes: undefined,
      });
      load("original");
    },
    select(id) {
      const subject = current.subject;
      if (!current.open || subject === undefined || !subject.versions.some((v) => v.id === id)) return;
      update({ selected: id });
      const state = current.versions[id];
      if (state === undefined || state.status === "idle") load(id);
    },
    retry(id) {
      if (!current.open || current.versions[id]?.status !== "error") return;
      load(id);
    },
    setNativeSize(on) {
      const subject = current.subject;
      if (!current.open || subject === undefined) return;
      if (!on && !isDisplayed(subject)) return;
      update({ mode: on ? "native" : "page" });
    },
    displayFailed(id) {
      if (current.versions[id]?.status !== "loaded") return;
      const url = urls.get(id);
      if (url !== undefined) {
        objectUrls.revoke(url);
        urls.delete(id);
      }
      setVersion(id, { status: "error", error: "display-failed" });
    },
    close() {
      if (!current.open) return;
      epoch++;
      for (const url of urls.values()) objectUrls.revoke(url);
      urls.clear();
      current = CLOSED;
      for (const listener of Array.from(listeners)) listener(current);
    },
  };
}
