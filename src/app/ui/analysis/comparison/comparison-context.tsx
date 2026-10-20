import { JSX, createContext, useContext } from "solid-js";
import { ComparisonSubject, ImageVariantStore } from "../../../domain/models/image-variants";
import { ComparisonDialog } from "./ComparisonDialog";
import { createComparisonController } from "./comparison-controller";

interface ImageComparison {
  open(subject: ComparisonSubject, trigger: HTMLElement): void;
}

const ImageComparisonContext = createContext<ImageComparison>();

/** Focus target: the trigger, else the re-rendered button with the same key (ARCH-DECISION-016). */
function restoreFocus(trigger: HTMLElement | undefined, key: string | undefined): void {
  if (trigger?.isConnected) {
    trigger.focus();
    return;
  }
  if (key === undefined) return;
  document.querySelector<HTMLElement>(`[data-comparison-key="${CSS.escape(key)}"]`)?.focus();
}

/** Owns the comparison controller and renders the one dialog of the app. */
export function ImageComparisonProvider(props: { store: ImageVariantStore; children: JSX.Element }) {
  const controller = createComparisonController({
    // eslint-disable-next-line solid/reactivity -- the store is created once and never replaced
    store: props.store,
    objectUrls: {
      create: (bytes, mimeType) => URL.createObjectURL(new Blob([bytes], { type: mimeType })),
      revoke: (url) => URL.revokeObjectURL(url),
    },
  });
  let trigger: HTMLElement | undefined;
  let key: string | undefined;

  const api: ImageComparison = {
    open(subject, element) {
      if (controller.state().open) return;
      trigger = element;
      key = element.dataset.comparisonKey;
      controller.open(subject);
    },
  };

  const close = () => {
    controller.close();
    restoreFocus(trigger, key);
    trigger = undefined;
    key = undefined;
  };

  return (
    <ImageComparisonContext.Provider value={api}>
      {props.children}
      <ComparisonDialog controller={controller} onClose={close} />
    </ImageComparisonContext.Provider>
  );
}

export function useImageComparison(): ImageComparison {
  const comparison = useContext(ImageComparisonContext);
  if (comparison == null) {
    throw new Error("useImageComparison must be used inside <ImageComparisonProvider>");
  }
  return comparison;
}
