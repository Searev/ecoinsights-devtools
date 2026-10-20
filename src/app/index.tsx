/* @refresh reload */
import { render } from "solid-js/web";

import "./index.css";
import App from "./App";
import { getBrowser, getImageEstimator } from "./infra/browser-factory";
import { BrowserProvider } from "./infra/browser-context";
import { ImageEstimatorProvider } from "./infra/estimator-context";
import { createImageVariantStore } from "./domain/image-comparison/variant-store";
import { ImageComparisonProvider } from "./ui/analysis/comparison/comparison-context";

const root = document.getElementById("root");

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    "Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?"
  );
}

Promise.all([getBrowser(), getImageEstimator()]).then(([browser, estimator]) => {
  const store = createImageVariantStore(estimator);
  render(
    () => (
      <BrowserProvider browser={browser}>
        <ImageEstimatorProvider estimator={estimator}>
          <ImageComparisonProvider store={store}>
            <App />
          </ImageComparisonProvider>
        </ImageEstimatorProvider>
      </BrowserProvider>
    ),
    root!
  );
});
