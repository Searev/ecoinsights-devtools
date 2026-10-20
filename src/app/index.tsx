/* @refresh reload */
import { render } from "solid-js/web";

import "./index.css";
import App from "./App";
import { getBrowser, getContentAnalyser, getImageEstimator, getPreviewFileLoader } from "./infra/browser-factory";
import { BrowserProvider } from "./infra/browser-context";
import { ImageEstimatorProvider } from "./infra/estimator-context";
import { ContentAnalyserProvider } from "./infra/content-analyser-context";
import { createImageVariantStore } from "./domain/image-comparison/variant-store";
import { createSessionFileCache } from "./domain/image-comparison/session-file-cache";
import { createPreviewFileStore } from "./domain/file-preview/preview-store";
import { AppDialogProvider } from "./ui/analysis/dialog/DialogHost";

const root = document.getElementById("root");

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    "Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?"
  );
}

Promise.all([getBrowser(), getImageEstimator(), getContentAnalyser(), getPreviewFileLoader()]).then(
  ([browser, estimator, contentAnalyser, previewLoader]) => {
    const cache = createSessionFileCache();
    const variantStore = createImageVariantStore(estimator, { cache });
    const previewStore = createPreviewFileStore(previewLoader, { cache });
    render(
      () => (
        <BrowserProvider browser={browser}>
          <ImageEstimatorProvider estimator={estimator}>
            <ContentAnalyserProvider analyser={contentAnalyser}>
              <AppDialogProvider variantStore={variantStore} previewStore={previewStore}>
                <App />
              </AppDialogProvider>
            </ContentAnalyserProvider>
          </ImageEstimatorProvider>
        </BrowserProvider>
      ),
      root!
    );
  }
);
