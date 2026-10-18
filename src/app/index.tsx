/* @refresh reload */
import { render } from "solid-js/web";

import "./index.css";
import App from "./App";
import { getBrowser } from "./infra/browser-factory";
import { BrowserProvider } from "./infra/browser-context";

const root = document.getElementById("root");

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    "Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?"
  );
}

getBrowser().then((browser) =>
  render(
    () => (
      <BrowserProvider browser={browser}>
        <App />
      </BrowserProvider>
    ),
    root!
  )
);
