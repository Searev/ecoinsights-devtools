import { Match, Show, Switch, createSignal, onCleanup, onMount } from "solid-js";
import { PreviewFileStore, TextPreviewSubject } from "../../../domain/models/file-preview";
import { RETRY_LABEL } from "../comparison/comparison-format";
import { PreviewInfoList } from "./PreviewInfoList";
import { textLanguage } from "./syntax/syntax-types";
import { TextDocument } from "./text-document";
import { createTextPreviewController } from "./text-preview-controller";
import {
  TEXT_CONTENT_LABEL,
  TEXT_EMPTY,
  TEXT_LOADING,
  gutterDigits,
  textCapNotice,
  textErrorMessage,
  textInfoRows,
} from "./text-preview-format";
import { TextView, renderTextView } from "./text-view-renderer";
import "./text-view.css";

/**
 * Body of the text preview dialog (US-020). Wiring only. The tokenizers are loaded with a dynamic
 * `import()` so they stay in a separate chunk (ARCH-DECISION-025).
 */
export function TextPreviewBody(props: { subject: TextPreviewSubject; store: PreviewFileStore }) {
  // eslint-disable-next-line solid/reactivity -- the body is re-mounted per opening
  const controller = createTextPreviewController({ store: props.store });
  const [state, setState] = createSignal(controller.state());
  const unsubscribe = controller.subscribe(setState);
  let view: TextView | undefined;

  const cancelView = () => {
    view?.cancel();
    view = undefined;
  };

  onMount(() => controller.open(props.subject));
  onCleanup(() => {
    cancelView();
    unsubscribe();
    controller.close();
  });

  const mountView = (block: HTMLDivElement, document: TextDocument) => {
    cancelView();
    const language = textLanguage(props.subject.fileType);
    view = renderTextView(block, document.lines, {
      highlighter: () => import("./syntax").then((m) => m.createLineHighlighter(language)),
      schedule: (task) => {
        setTimeout(task, 0);
      },
      now: () => performance.now(),
    });
  };

  const loaded = () => {
    const content = state().content;
    return content.status === "loaded" ? content : undefined;
  };

  return (
    <Switch>
      <Match when={state().content.status === "loading"}>
        <p role="status">{TEXT_LOADING}</p>
      </Match>
      <Match when={state().content.status === "error"}>
        <div role="alert" class="flex flex-row items-center gap-2">
          <p>{textErrorMessage((state().content as { status: "error"; error: "unavailable" | "too-large" }).error)}</p>
          <button type="button" class="btn-secondary" onClick={() => controller.retry()}>
            {RETRY_LABEL}
          </button>
        </div>
      </Match>
      <Match when={loaded()}>
        {(content) => (
          <div class="flex flex-col gap-3">
            <PreviewInfoList rows={textInfoRows(props.subject, content().info, content().document)} />
            <Show when={textCapNotice(content().info, content().document)}>{(notice) => <p>{notice()}</p>}</Show>
            <Show
              when={content().document.lineCount > 0}
              fallback={<p>{TEXT_EMPTY}</p>}
            >
              <div
                class="text-view"
                tabindex="0"
                role="region"
                aria-label={TEXT_CONTENT_LABEL}
                style={{
                  "--gutter-ch": String(gutterDigits(content().document.lineCount)),
                }}
                ref={(block) => mountView(block, content().document)}
              />
            </Show>
          </div>
        )}
      </Match>
    </Switch>
  );
}
