import { Show } from "solid-js";
import { ComparisonSubject } from "../../domain/models/image-variants";
import { DisplayImageName } from "./image-name";
import { PreviewSubject } from "../../domain/models/file-preview";
import { useAppDialog } from "./dialog/DialogHost";
import { dialogKey } from "./dialog/dialog-host";

/**
 * Shortened image name (US-004). The visible short text is hidden from assistive technologies,
 * which read the full name instead. With a comparison subject (offenders only, US-005) the same
 * content is a button that opens the comparison dialog; with a preview subject (EPIC-PV) it opens
 * the preview dialog.
 */
export function ImageName(props: {
  name: DisplayImageName;
  comparison?: ComparisonSubject;
  /** BP2 file lines (EPIC-PV): opens a preview. Ignored when `comparison` is set. */
  preview?: PreviewSubject;
  ruleId?: string;
  url?: string;
}) {
  const dialog = useAppDialog();
  const content = () => (
    <>
      <span aria-hidden="true">{props.name.short}</span>
      <span class="sr-only">{props.name.full}</span>
    </>
  );
  const action = () => {
    const comparison = props.comparison;
    if (comparison !== undefined) {
      return (trigger: HTMLElement) => dialog.openComparison(comparison, trigger);
    }
    const preview = props.preview;
    if (preview !== undefined) return (trigger: HTMLElement) => dialog.openPreview(preview, trigger);
    return undefined;
  };
  return (
    <Show
      when={action()}
      fallback={
        <span class="whitespace-nowrap" title={props.name.full}>
          {content()}
        </span>
      }
    >
      {(open) => (
        <button
          type="button"
          class="whitespace-nowrap text-left bg-transparent p-0 font-normal text-inherit hover:underline focus:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          title={props.name.full}
          aria-haspopup="dialog"
          data-dialog-key={dialogKey(props.ruleId ?? "", props.url ?? "")}
          onClick={(event) => open()(event.currentTarget)}
        >
          {content()}
        </button>
      )}
    </Show>
  );
}
