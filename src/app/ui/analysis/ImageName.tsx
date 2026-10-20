import { Show } from "solid-js";
import { ComparisonSubject } from "../../domain/models/image-variants";
import { DisplayImageName } from "./image-name";
import { useImageComparison } from "./comparison/comparison-context";

/**
 * Shortened image name (US-004). The visible short text is hidden from assistive technologies,
 * which read the full name instead. With a comparison subject (offenders only, US-005) the same
 * content is a button that opens the comparison dialog.
 */
export function ImageName(props: {
  name: DisplayImageName;
  comparison?: ComparisonSubject;
  ruleId?: string;
  url?: string;
}) {
  const comparison = useImageComparison();
  const content = () => (
    <>
      <span aria-hidden="true">{props.name.short}</span>
      <span class="sr-only">{props.name.full}</span>
    </>
  );
  return (
    <Show
      when={props.comparison}
      fallback={
        <span class="whitespace-nowrap" title={props.name.full}>
          {content()}
        </span>
      }
    >
      {(subject) => (
        <button
          type="button"
          class="whitespace-nowrap text-left bg-transparent p-0 font-normal text-inherit hover:underline focus:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          title={props.name.full}
          aria-haspopup="dialog"
          data-comparison-key={`${props.ruleId}|${props.url}`}
          onClick={(event) => comparison.open(subject(), event.currentTarget)}
        >
          {content()}
        </button>
      )}
    </Show>
  );
}
