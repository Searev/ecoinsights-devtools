import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { ImageVersionId } from "../../../domain/models/image-variants";
import { displayImageName } from "../image-name";
import { ComparisonController, ComparisonState } from "./comparison-controller";
import {
  CHANGED_NOTICE,
  MODE_NATIVE_LABEL,
  MODE_PAGE_LABEL,
  NOT_DISPLAYED_HINT,
  RETRY_LABEL,
  errorMessage,
  formatFileFormat,
  formatGain,
  formatResolution,
  formatSize,
  loadingMessage,
  versionAlt,
} from "./comparison-format";
import { isDisplayed, nativeCssSize, pageBox } from "./comparison-layout";

/**
 * Body of the comparison dialog (ARCH-DECISION-016, 021). Wiring only: logic is in the controller
 * and helpers. The host opens and closes the controller, renders the header and "Fermer", and
 * mounts this body once per opening after `showModal()` so that the area width is measured.
 */
export function ComparisonBody(props: { controller: ComparisonController }) {
  let area!: HTMLDivElement;
  // eslint-disable-next-line solid/reactivity -- the controller is created once by the provider
  const [state, setState] = createSignal<ComparisonState>(props.controller.state());
  const [areaWidth, setAreaWidth] = createSignal(0);
  let savedScroll = { left: 0, top: 0 };

  // eslint-disable-next-line solid/reactivity -- the controller is created once by the provider
  const unsubscribe = props.controller.subscribe(setState);
  onCleanup(unsubscribe);

  onMount(() => {
    const measure = () => setAreaWidth(area.clientWidth);
    measure();
    window.addEventListener("resize", measure);
    onCleanup(() => window.removeEventListener("resize", measure));
  });

  const subject = () => state().subject;
  const name = createMemo(() => {
    const s = subject();
    return s === undefined ? undefined : displayImageName(s.url);
  });
  const version = () => subject()?.versions.find((v) => v.id === state().selected);
  const selectedState = () => state().versions[state().selected];

  const selectVersion = (id: ImageVersionId) => {
    savedScroll = { left: area.scrollLeft, top: area.scrollTop };
    props.controller.select(id);
  };
  const restoreScroll = () => {
    area.scrollLeft = savedScroll.left;
    area.scrollTop = savedScroll.top;
  };

  return (
    <div class="flex flex-col gap-3">
      <Show when={subject()}>
        {(s) => (
          <>
            <fieldset class="flex flex-row flex-wrap gap-4">
              <legend class="sr-only">Version affichée</legend>
              <For each={s().versions}>
                {(v) => (
                  <label class="flex flex-row items-center gap-1">
                    <input
                      type="radio"
                      name="comparison-version"
                      value={v.id}
                      checked={state().selected === v.id}
                      onChange={() => selectVersion(v.id)}
                    />
                    {v.label}
                  </label>
                )}
              </For>
            </fieldset>

            <div>
              <label class="flex flex-row items-center gap-1">
                <input
                  type="checkbox"
                  checked={state().mode === "native"}
                  disabled={!isDisplayed(s())}
                  onChange={(event) => props.controller.setNativeSize(event.currentTarget.checked)}
                />
                {MODE_NATIVE_LABEL}
              </label>
              <Show when={!isDisplayed(s())}>
                <p class="text-sm text-onsurface">{NOT_DISPLAYED_HINT}</p>
              </Show>
              <Show when={isDisplayed(s()) && state().mode === "page"}>
                <p class="text-sm text-onsurface">{MODE_PAGE_LABEL}</p>
              </Show>
            </div>

            <Show when={state().changed}>
              <p role="status" class="text-sm text-yellow-500">
                {CHANGED_NOTICE}
              </p>
            </Show>
          </>
        )}
      </Show>

      <div ref={area} class="bg-background rounded p-1" style={{ overflow: "auto", "max-height": "60vh" }}>
        <Show when={selectedState()} keyed>
          {(v) => (
            <>
              <Show when={v.status === "loading"}>
                <p role="status">{loadingMessage(state().selected)}</p>
              </Show>
              <Show when={v.status === "error" ? v : undefined} keyed>
                {(e) => (
                  <div role="alert" class="flex flex-row items-center gap-2">
                    <p>{errorMessage(e.error)}</p>
                    <button
                      type="button"
                      class="btn-secondary"
                      onClick={() => props.controller.retry(state().selected)}
                    >
                      {RETRY_LABEL}
                    </button>
                  </div>
                )}
              </Show>
              <Show when={v.status === "loaded" ? v : undefined} keyed>
                {(l) => {
                  const size = () => {
                    const s = subject()!;
                    return state().mode === "page" && isDisplayed(s)
                      ? pageBox(s.display!, areaWidth())
                      : nativeCssSize(l.info, window.devicePixelRatio);
                  };
                  return (
                    <img
                      src={l.objectUrl}
                      alt={versionAlt(version()!, l.info, name()!.full)}
                      style={{
                        width: `${size().width}px`,
                        height: `${size().height}px`,
                        "max-width": "none",
                      }}
                      onLoad={restoreScroll}
                      onError={() => props.controller.displayFailed(state().selected)}
                    />
                  );
                }}
              </Show>
            </>
          )}
        </Show>
      </div>

      <Show when={selectedState()?.status === "loaded" ? selectedState() : undefined} keyed>
        {(v) => {
          const loaded = v as Extract<typeof v, { status: "loaded" }>;
          const isOriginal = () => state().selected === "original";
          const bytes = () =>
            isOriginal() ? state().referenceBytes ?? loaded.info.byteLength : loaded.info.byteLength;
          return (
            <dl class="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
              <dt class="text-onsurface">Résolution</dt>
              <dd>{formatResolution(loaded.info.width, loaded.info.height)}</dd>
              <dt class="text-onsurface">Poids</dt>
              <dd>{formatSize(bytes())}</dd>
              <dt class="text-onsurface">Format</dt>
              <dd>{formatFileFormat(loaded.info)}</dd>
              <Show when={!isOriginal() && state().referenceBytes !== undefined}>
                <dt class="text-onsurface">Gain</dt>
                <dd>{formatGain(state().referenceBytes!, loaded.info.byteLength)}</dd>
              </Show>
            </dl>
          );
        }}
      </Show>
    </div>
  );
}
