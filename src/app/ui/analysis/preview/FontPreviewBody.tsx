import { For, Match, Show, Switch, createSignal, onCleanup, onMount } from "solid-js";
import { FontPreviewSubject, PreviewFileStore } from "../../../domain/models/file-preview";
import { RETRY_LABEL } from "../comparison/comparison-format";
import { createFontPreviewController } from "./font-preview-controller";
import {
  FONT_CHOICES,
  FONT_GROUP_LABEL,
  FONT_LOADING,
  FONT_SAMPLE_AUTHOR,
  FONT_SAMPLE_SIZE_PX,
  FONT_SAMPLE_TEXT,
  fontErrorMessage,
  fontInfoRows,
  sampleFontFamily,
} from "./font-preview-format";
import { createDocumentFontRegistry } from "./font-registry";
import { PreviewInfoList } from "./PreviewInfoList";

/**
 * Body of the font preview dialog (US-018). Wiring only: the font is registered in the panel
 * document (`document.fonts`) and released on cleanup.
 */
export function FontPreviewBody(props: { subject: FontPreviewSubject; store: PreviewFileStore }) {
  // eslint-disable-next-line solid/reactivity -- the body is re-mounted per opening
  const controller = createFontPreviewController({
    store: props.store,
    fonts: createDocumentFontRegistry({
      fonts: document.fonts,
      createFace: (family, data, descriptors) => new FontFace(family, data, descriptors),
    }),
  });
  const [state, setState] = createSignal(controller.state());
  const unsubscribe = controller.subscribe(setState);

  onMount(() => controller.open(props.subject));
  onCleanup(() => {
    unsubscribe();
    controller.close();
  });

  const loadedFont = () => {
    const font = state().font;
    return font.status === "loaded" ? font : undefined;
  };
  const family = () => {
    const choice = state().choice;
    return sampleFontFamily(choice, loadedFont()?.family);
  };
  const showSample = () => state().choice !== "downloaded" || state().font.status === "loaded";

  return (
    <div class="flex flex-col gap-3">
      <fieldset class="flex flex-row flex-wrap gap-4">
        <legend>{FONT_GROUP_LABEL}</legend>
        <For each={FONT_CHOICES}>
          {(choice) => (
            <label class="flex flex-row items-center gap-1">
              <input
                type="radio"
                name="font-preview-choice"
                value={choice.id}
                checked={state().choice === choice.id}
                onChange={() => controller.select(choice.id)}
              />
              {choice.label}
            </label>
          )}
        </For>
      </fieldset>

      <div class="bg-background rounded p-2" style={{ "max-height": "60vh", overflow: "auto" }}>
        <Show when={showSample()}>
          <figure>
            <p
              class="select-text"
              style={{
                "font-family": family(),
                "font-size": `${FONT_SAMPLE_SIZE_PX}px`,
                "overflow-wrap": "anywhere",
              }}
            >
              {FONT_SAMPLE_TEXT}
            </p>
            <p
              class="select-text"
              style={{
                "font-family": family(),
                "font-size": `${FONT_SAMPLE_SIZE_PX}px`,
                "overflow-wrap": "anywhere",
              }}
            >
              {FONT_SAMPLE_AUTHOR}
            </p>
          </figure>
        </Show>
        <Show when={state().choice === "downloaded"}>
          <Switch>
            <Match when={state().font.status === "loading"}>
              <p role="status">{FONT_LOADING}</p>
            </Match>
            <Match when={state().font.status === "error"}>
              <div role="alert" class="flex flex-row items-center gap-2">
                <p>
                  {fontErrorMessage(
                    (state().font as { status: "error"; error: "unavailable" | "unsupported" }).error
                  )}
                </p>
                <button type="button" class="btn-secondary" onClick={() => controller.retry()}>
                  {RETRY_LABEL}
                </button>
              </div>
            </Match>
          </Switch>
        </Show>
      </div>

      <Show when={loadedFont()}>{(font) => <PreviewInfoList rows={fontInfoRows(font().info)} />}</Show>
    </div>
  );
}
