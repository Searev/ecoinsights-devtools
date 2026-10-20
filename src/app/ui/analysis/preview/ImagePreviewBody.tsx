import { Match, Show, Switch, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { ImagePreviewSubject, PreviewFileStore } from "../../../domain/models/file-preview";
import {
  MODE_NATIVE_LABEL,
  MODE_PAGE_LABEL,
  NOT_DISPLAYED_HINT,
  RETRY_LABEL,
} from "../comparison/comparison-format";
import { displayImageName } from "../image-name";
import { ImagePreviewState, createImagePreviewController } from "./image-preview-controller";
import { imageErrorMessage, imageInfoRows, imagePreviewAlt } from "./image-preview-format";
import { imagePreviewSize, isDisplayedBox } from "./image-preview-layout";
import { PREVIEW_LOADING } from "./info-rows";
import { PreviewInfoList } from "./PreviewInfoList";

/**
 * Body of the image preview dialog (US-015). Wiring only: logic is in the controller and helpers.
 * The host renders the header and the close button.
 */
export function ImagePreviewBody(props: { subject: ImagePreviewSubject; store: PreviewFileStore }) {
  let area!: HTMLDivElement;
  // eslint-disable-next-line solid/reactivity -- the body is mounted once per opening
  const controller = createImagePreviewController({
    // eslint-disable-next-line solid/reactivity -- the body is mounted once per opening
    store: props.store,
    objectUrls: {
      create: (bytes, mimeType) => URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType })),
      revoke: (url) => URL.revokeObjectURL(url),
    },
  });
  const [state, setState] = createSignal<ImagePreviewState>(controller.state());
  const [areaWidth, setAreaWidth] = createSignal(0);
  const unsubscribe = controller.subscribe(setState);

  onMount(() => {
    const measure = () => setAreaWidth(area.clientWidth);
    measure();
    window.addEventListener("resize", measure);
    onCleanup(() => window.removeEventListener("resize", measure));
    controller.open(props.subject);
  });
  onCleanup(() => {
    unsubscribe();
    controller.close();
  });

  const displayed = () => isDisplayedBox(props.subject.display);
  const fullName = createMemo(() => displayImageName(props.subject.url).full);

  return (
    <div class="flex flex-col gap-3">
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
          <p class="text-sm text-onsurface">{NOT_DISPLAYED_HINT}</p>
        </Show>
        <Show when={displayed() && state().mode === "page"}>
          <p class="text-sm text-onsurface">{MODE_PAGE_LABEL}</p>
        </Show>
      </div>

      <div ref={area} class="bg-background rounded p-1" style={{ overflow: "auto", "max-height": "60vh" }}>
        <Switch>
          <Match when={state().content.status === "loading"}>
            <p role="status">{PREVIEW_LOADING}</p>
          </Match>
          <Match when={state().content.status === "error" ? state().content : undefined} keyed>
            {(content) => (
              <div role="alert" class="flex flex-row items-center gap-2">
                <p>{content.status === "error" ? imageErrorMessage(content.error) : ""}</p>
                <button type="button" class="btn-secondary" onClick={() => controller.retry()}>
                  {RETRY_LABEL}
                </button>
              </div>
            )}
          </Match>
          <Match when={state().content.status === "loaded" ? state().content : undefined} keyed>
            {(content) => {
              if (content.status !== "loaded") return null;
              const size = () => {
                const s = state().content;
                if (s.status !== "loaded") return undefined;
                return imagePreviewSize({
                  mode: state().mode,
                  display: props.subject.display,
                  info: s.info,
                  decoded: s.decoded,
                  areaWidth: areaWidth(),
                  devicePixelRatio: window.devicePixelRatio,
                });
              };
              return (
                <img
                  src={content.objectUrl}
                  alt={imagePreviewAlt(fullName(), content.info, content.decoded)}
                  style={{
                    width: size() === undefined ? undefined : `${size()!.width}px`,
                    height: size() === undefined ? undefined : `${size()!.height}px`,
                    "max-width": size() === undefined ? "100%" : "none",
                  }}
                  onLoad={(event) => controller.decoded(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
                  onError={() => controller.displayFailed()}
                />
              );
            }}
          </Match>
        </Switch>
      </div>

      <Show when={state().content.status === "loaded" ? state().content : undefined} keyed>
        {(content) =>
          content.status === "loaded" ? <PreviewInfoList rows={imageInfoRows(content.info, content.decoded)} /> : null
        }
      </Show>
    </div>
  );
}
