import { Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { MediaPreviewSubject } from "../../../domain/models/file-preview";
import { displayImageName } from "../image-name";
import { MODE_NATIVE_LABEL, MODE_PAGE_LABEL, RETRY_LABEL } from "../comparison/comparison-format";
import { mediaDisplaySize, releaseMedia } from "./media-element";
import {
  VIDEO_NOT_DISPLAYED_HINT,
  mediaAccessibleName,
  mediaErrorMessage,
  mediaInfoRows,
} from "./media-format";
import { createMediaPreviewController } from "./media-preview-controller";
import { PREVIEW_LOADING } from "./info-rows";
import { PreviewInfoList } from "./PreviewInfoList";

/** US-016: streamed native player. Wiring only: logic is in the controller and helpers. */
export function MediaPreviewBody(props: { subject: MediaPreviewSubject }) {
  let area!: HTMLDivElement;
  let element: HTMLVideoElement | HTMLAudioElement | undefined;
  // eslint-disable-next-line solid/reactivity -- the body is re-mounted per opening, the subject is fixed
  const kind = props.subject.media;
  const controller = createMediaPreviewController({
    canPlayType: (type) => document.createElement(kind).canPlayType(type),
  });
  const [state, setState] = createSignal(controller.state());
  const [areaWidth, setAreaWidth] = createSignal(0);

  const unsubscribe = controller.subscribe(setState);
  const fullName = createMemo(() => displayImageName(props.subject.url).full);
  const content = () => state().content;
  const metadata = () => {
    const c = content();
    return c.status === "loaded" ? c.metadata : undefined;
  };
  const errorKind = () => {
    const c = content();
    return c.status === "error" ? c.error : undefined;
  };
  const displayed = () => {
    const d = props.subject.display;
    return d !== undefined && d.width > 0 && d.height > 0;
  };
  const size = () =>
    kind === "video"
      ? mediaDisplaySize({
          mode: state().mode,
          display: props.subject.display,
          metadata: metadata(),
          areaWidth: areaWidth(),
          devicePixelRatio: window.devicePixelRatio,
        })
      : undefined;
  // The player is rendered once a source was accepted; a canPlayType refusal never renders it (S6).
  const [rendered, setRendered] = createSignal(false);
  createEffect(() => {
    const status = content().status;
    if (status === "loading" || status === "loaded") setRendered(true);
  });

  onMount(() => {
    const measure = () => setAreaWidth(area.clientWidth);
    measure();
    window.addEventListener("resize", measure);
    onCleanup(() => window.removeEventListener("resize", measure));
    controller.open(props.subject);
  });

  createEffect(
    on(
      () => state().reloads,
      (reloads, previous) => {
        if (previous !== undefined && reloads !== previous) element?.load();
      },
    ),
  );

  onCleanup(() => {
    unsubscribe();
    controller.close();
    if (element !== undefined) releaseMedia(element);
  });

  const setup = (el: HTMLVideoElement | HTMLAudioElement) => {
    element = el;
  };
  const onMetadata = (el: HTMLVideoElement | HTMLAudioElement) =>
    controller.metadataLoaded({
      duration: el.duration,
      width: el instanceof HTMLVideoElement ? el.videoWidth : undefined,
      height: el instanceof HTMLVideoElement ? el.videoHeight : undefined,
    });

  return (
    <div class="flex flex-col gap-3">
      <Show when={kind === "video"}>
        <div>
          <label class="flex flex-row items-center gap-1">
            <input
              type="checkbox"
              checked={state().mode === "native"}
              disabled={!displayed()}
              onChange={(event) => controller.setNativeSize(event.currentTarget.checked)}
            />
            {MODE_NATIVE_LABEL}
          </label>
          <Show when={!displayed()}>
            <p class="text-sm text-onsurface">{VIDEO_NOT_DISPLAYED_HINT}</p>
          </Show>
          <Show when={displayed() && state().mode === "page"}>
            <p class="text-sm text-onsurface">{MODE_PAGE_LABEL}</p>
          </Show>
        </div>
      </Show>

      <div ref={area} class="bg-background rounded p-1" style={{ overflow: "auto", "max-height": "60vh" }}>
        <Show when={content().status === "loading"}>
          <p role="status">{PREVIEW_LOADING}</p>
        </Show>
        <Show when={errorKind()}>
          {(error) => (
            <div role="alert" class="flex flex-row items-center gap-2">
              <p>{mediaErrorMessage(error())}</p>
              <button type="button" class="btn-secondary" onClick={() => controller.retry()}>
                {RETRY_LABEL}
              </button>
            </div>
          )}
        </Show>
        <Show when={rendered()}>
          <Show
            when={kind === "video"}
            fallback={
              <audio
                ref={setup}
                controls
                preload="metadata"
                src={props.subject.url}
                aria-label={mediaAccessibleName(fullName())}
                style={{ visibility: content().status === "loading" ? "hidden" : "visible" }}
                onLoadedMetadata={(event) => onMetadata(event.currentTarget)}
                onError={(event) => controller.failed(event.currentTarget.error?.code)}
              />
            }
          >
            <video
              ref={setup}
              controls
              preload="metadata"
              src={props.subject.url}
              aria-label={mediaAccessibleName(fullName())}
              style={{
                visibility: content().status === "loading" ? "hidden" : "visible",
                width: size() === undefined ? undefined : `${size()!.width}px`,
                height: size() === undefined ? undefined : `${size()!.height}px`,
                "max-width": size() === undefined ? "100%" : "none",
              }}
              onLoadedMetadata={(event) => onMetadata(event.currentTarget)}
              onError={(event) => controller.failed(event.currentTarget.error?.code)}
            />
          </Show>
        </Show>
      </div>

      <PreviewInfoList rows={mediaInfoRows(props.subject, metadata())} />
    </div>
  );
}
