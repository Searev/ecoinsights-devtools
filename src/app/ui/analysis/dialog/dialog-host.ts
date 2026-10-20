/**
 * State of the one app-level dialog (ARCH-DECISION-021). Pure: the Solid host renders it and owns
 * the native `<dialog>`, focus and the bodies.
 */
import { PreviewSubject } from "../../../domain/models/file-preview";
import { ComparisonSubject } from "../../../domain/models/image-variants";
import { DisplayImageName, displayImageName } from "../image-name";

export type DialogRequest =
  | { kind: "comparison"; subject: ComparisonSubject }
  | { kind: "preview"; subject: PreviewSubject };

export interface DialogHostState {
  open: boolean;
  request?: DialogRequest;
  /** `data-dialog-key` of the trigger, used to return focus after a re-render. */
  key?: string;
  /** Incremented on each accepted open: bodies are re-mounted per opening. */
  opening: number;
}

export interface DialogHost {
  state(): DialogHostState;
  subscribe(listener: (state: DialogHostState) => void): () => void;
  /** Returns false and changes nothing while a dialog is open (double click). */
  open(request: DialogRequest, key?: string): boolean;
  /** Idempotent. */
  close(): void;
}

export function dialogKey(ruleId: string, url: string): string {
  return `${ruleId}|${url}`;
}

export function dialogTitle(request: DialogRequest): DisplayImageName {
  return displayImageName(request.subject.url);
}

export function createDialogHost(): DialogHost {
  let state: DialogHostState = { open: false, opening: 0 };
  const listeners = new Set<(state: DialogHostState) => void>();

  const set = (next: DialogHostState) => {
    state = next;
    for (const listener of [...listeners]) listener(state);
  };

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open(request, key) {
      if (state.open) return false;
      set({ open: true, request, ...(key !== undefined ? { key } : {}), opening: state.opening + 1 });
      return true;
    },
    close() {
      if (!state.open) return;
      set({ open: false, opening: state.opening });
    },
  };
}
