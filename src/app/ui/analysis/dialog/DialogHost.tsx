import { JSX, Match, Show, Switch, createContext, createSignal, onCleanup, useContext } from "solid-js";
import { ImageVariantStore, ComparisonSubject } from "../../../domain/models/image-variants";
import { PreviewFileStore, PreviewSubject } from "../../../domain/models/file-preview";
import { CLOSE_LABEL } from "../comparison/comparison-format";
import { createComparisonController } from "../comparison/comparison-controller";
import { ComparisonBody } from "../comparison/ComparisonBody";
import { FontPreviewBody } from "../preview/FontPreviewBody";
import { IframePreviewBody } from "../preview/IframePreviewBody";
import { ImagePreviewBody } from "../preview/ImagePreviewBody";
import { MediaPreviewBody } from "../preview/MediaPreviewBody";
import { TextPreviewBody } from "../preview/TextPreviewBody";
import { DialogHostState, DialogRequest, createDialogHost, dialogTitle } from "./dialog-host";

interface AppDialog {
  openComparison(subject: ComparisonSubject, trigger: HTMLElement): void;
  openPreview(subject: PreviewSubject, trigger: HTMLElement): void;
}

const AppDialogContext = createContext<AppDialog>();

/** Focus target: the trigger, else the re-rendered button with the same key (ARCH-DECISION-016, 021). */
function restoreFocus(trigger: HTMLElement | undefined, key: string | undefined): void {
  if (trigger?.isConnected) {
    trigger.focus();
    return;
  }
  if (key === undefined) return;
  document.querySelector<HTMLElement>(`[data-dialog-key="${CSS.escape(key)}"]`)?.focus();
}

/**
 * Owns the one `<dialog>` of the app (ARCH-DECISION-021). Wiring only: the state is the pure host.
 * A body is mounted only after `showModal()` (so it can measure its area) and unmounted on close.
 */
export function AppDialogProvider(props: {
  variantStore: ImageVariantStore;
  previewStore: PreviewFileStore;
  children: JSX.Element;
}) {
  let dialog!: HTMLDialogElement;
  const host = createDialogHost();
  const [state, setState] = createSignal<DialogHostState>(host.state());
  const [shown, setShown] = createSignal(false);
  const unsubscribe = host.subscribe(setState);
  onCleanup(unsubscribe);

  const controller = createComparisonController({
    // eslint-disable-next-line solid/reactivity -- the store is created once and never replaced
    store: props.variantStore,
    objectUrls: {
      create: (bytes, mimeType) => URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType })),
      revoke: (url) => URL.revokeObjectURL(url),
    },
  });
  let trigger: HTMLElement | undefined;

  const show = (request: DialogRequest, element: HTMLElement) => {
    const key = element.dataset.dialogKey;
    if (!host.open(request, key)) return;
    trigger = element;
    if (request.kind === "comparison") controller.open(request.subject);
    dialog.showModal();
    setShown(true);
  };

  const close = () => {
    if (!host.state().open) return;
    const key = host.state().key;
    setShown(false);
    controller.close();
    host.close();
    if (dialog.open) dialog.close();
    restoreFocus(trigger, key);
    trigger = undefined;
  };

  const api: AppDialog = {
    openComparison: (subject, element) => show({ kind: "comparison", subject }, element),
    openPreview: (subject, element) => show({ kind: "preview", subject }, element),
  };

  const title = () => {
    const request = state().request;
    return request === undefined ? undefined : dialogTitle(request);
  };

  return (
    <AppDialogContext.Provider value={api}>
      {props.children}
      <dialog
        ref={dialog}
        aria-labelledby="app-dialog-title"
        class="p-0 bg-surface text-white rounded"
        style={{ "max-width": "90vw", "max-height": "90vh" }}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          // The content fills the dialog, so only a backdrop click targets the dialog itself.
          if (event.target === event.currentTarget) close();
        }}
      >
        <div class="p-4 flex flex-col gap-3">
          <Show when={state().request}>
            {(request) => (
              <header>
                <h2 id="app-dialog-title" class="font-bold text-xl" title={title()?.full}>
                  <span aria-hidden="true">{title()?.short}</span>
                  <span class="sr-only">{title()?.full}</span>
                </h2>
                <p class="break-all select-text text-sm text-onsurface">{request().subject.url}</p>
              </header>
            )}
          </Show>

          <Show when={shown() ? state().request : undefined} keyed>
            {(request) => (
              <Switch>
                <Match when={request.kind === "comparison"}>
                  <ComparisonBody controller={controller} />
                </Match>
                <Match when={request.kind === "preview" && request.subject.kind === "image" ? request.subject : undefined}>
                  {(image) => <ImagePreviewBody subject={image()} store={props.previewStore} />}
                </Match>
                <Match when={request.kind === "preview" && request.subject.kind === "media" ? request.subject : undefined}>
                  {(media) => <MediaPreviewBody subject={media()} />}
                </Match>
                <Match when={request.kind === "preview" && request.subject.kind === "iframe" ? request.subject : undefined}>
                  {(iframe) => <IframePreviewBody subject={iframe()} />}
                </Match>
                <Match when={request.kind === "preview" && request.subject.kind === "font" ? request.subject : undefined}>
                  {(font) => <FontPreviewBody subject={font()} store={props.previewStore} />}
                </Match>
                <Match when={request.kind === "preview" && request.subject.kind === "text" ? request.subject : undefined}>
                  {(text) => <TextPreviewBody subject={text()} store={props.previewStore} />}
                </Match>
              </Switch>
            )}
          </Show>

          <div class="flex flex-row justify-end">
            <button type="button" class="btn-secondary" onClick={close}>
              {CLOSE_LABEL}
            </button>
          </div>
        </div>
      </dialog>
    </AppDialogContext.Provider>
  );
}

export function useAppDialog(): AppDialog {
  const dialog = useContext(AppDialogContext);
  if (dialog == null) {
    throw new Error("useAppDialog must be used inside <AppDialogProvider>");
  }
  return dialog;
}
