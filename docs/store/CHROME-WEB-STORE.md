# Chrome Web Store submission: EcoInsights Devtools 1.0.0

These are the answers to paste into the developer dashboard. The privacy policy is [PRIVACY.md](../../PRIVACY.md). Publish it at a public URL, for example the GitHub file once the repository is public, and paste that URL in "Privacy policy URL".

## Listing

- **Name:** EcoInsights Devtools
- **Summary** (132 characters max): Mesurez l'impact environnemental d'un parcours utilisateur et vérifiez les bonnes pratiques d'écoconception web.
- **Category:** Developer Tools
- **Language:** French

## Single purpose

> EcoInsights Devtools adds a DevTools panel that measures the environmental impact (EcoIndex) of a user journey on the inspected website and checks sustainable web design best practices on its pages.

## Permission justifications

| Permission | Justification |
|---|---|
| `scripting` | Injects a measurement script into the inspected tab only, during an analysis started by the user. It reads the DOM size and the images, media, fonts, iframes and canvases needed by the best-practice checks. |
| `tabs` | Reads the inspected tab's URL and title to name the analysis, reloads the tab at the start of an analysis, and opens documentation links in a new tab. |
| `browsingData` | When the user keeps the "Rafraîchir la page au début de l'analyse" option checked, it clears the HTTP cache and service workers before reloading, so the first page load is measured without cache. |
| Host permission `<all_urls>` | The user can analyse any website. The extension must inject its measurement script into that site and may download the site's images, fonts and text files again, from the HTTP cache when possible, to estimate optimisation gains and show previews. |
| Remote code | No. All code is bundled in the package; WebAssembly codecs are local files (`wasm-unsafe-eval` only). |

## Data usage form

- **Collected data:** none.
  - **"Website content"** is processed locally to compute the analysis and is never transmitted. Tick it only if the form requires declaring local processing; the reviewers' guidance is that data that never leaves the device is not "collected".
  - **"Web history":** not collected. The URLs of the pages the user chose to analyse are stored locally, in the user's own saved analyses.
- **Certifications** (tick all three):
  - I do not sell or transfer user data to third parties, outside of the approved use cases.
  - I do not use or transfer user data for purposes unrelated to the item's single purpose.
  - I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Assets still to produce

- [ ] Store icon, 128 × 128 (the existing `src/public/icons/icon_128.png` can be used).
- [ ] At least one screenshot, 1280 × 800 or 640 × 400 (for example a saved analysis with its best practices, in light and in dark).
- [ ] Optional small promotional tile, 440 × 280.

## Firefox (addons.mozilla.org), for reference

- `data_collection_permissions: { required: ["none"] }` is declared in `src/manifest/firefox.json`.
- The bundle is minified, so upload the **source code** (the repository at the release tag) with these build instructions:
  - Node 20;
  - `npm ci`;
  - `npm run build:firefox`;
  - the output is `dist/firefox`.
- `ecoindex_reference` is a Git dependency (`github:cnumr/ecoindex_reference#main`). Pin it to a commit before submitting, so that the reviewers' build matches.
