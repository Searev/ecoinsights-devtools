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
import { createThemeController } from "./ui/theme/theme-controller";
import { safeStorage } from "./ui/theme/theme-mode";
import { LIGHT_SCHEME_QUERY } from "./ui/theme/theme-types";
import { ThemeProvider } from "./ui/theme/ThemeProvider";

const root = document.getElementById("root");

// US-030: one theme controller for the panel. The boot script already set `data-theme` before the
// first paint (ARCH-DECISION-035); the controller re-applies it and follows the system and other panels.
const themeController = createThemeController({
  storage: safeStorage(() => window.localStorage),
  query: typeof window.matchMedia === "function" ? window.matchMedia(LIGHT_SCHEME_QUERY) : undefined,
  root: document.documentElement,
  events: window,
});

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
        <ThemeProvider controller={themeController}>
          <BrowserProvider browser={browser}>
            <ImageEstimatorProvider estimator={estimator}>
              <ContentAnalyserProvider analyser={contentAnalyser}>
                <AppDialogProvider variantStore={variantStore} previewStore={previewStore}>
                  <App />
                </AppDialogProvider>
              </ContentAnalyserProvider>
            </ImageEstimatorProvider>
          </BrowserProvider>
        </ThemeProvider>
      ),
      root!
    );
  }
);
