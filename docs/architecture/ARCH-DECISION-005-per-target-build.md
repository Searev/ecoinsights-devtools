# ARCH-DECISION-005: Per-target build with a generated manifest

- **Status:** Accepted (REFACTOR-001)
- **Supersedes:** `build-finalizer.js`, `src/public/manifestChrome.json`, `src/public/manifestFirefox.json`

## Context

- Two hand-maintained manifests were 90% identical and had already drifted (permissions, content scripts).
- `npm run build` produced a `dist/` holding both manifests, which neither browser could load.
- Zips were produced by hand into the repo root.
- Firefox had no `gecko.id`.

## Decision

- `src/manifest/base.json` plus `chrome.json` and `firefox.json` overlays, deep-merged at build time by a small, unit-tested function.
- `node scripts/build.mjs --target=chrome|firefox` does the following:
  1. Vite build of the panel and DevTools page into `dist/<target>/`.
  2. esbuild of `src/background/index.ts` → `dist/<target>/scripts/background.js` and `src/content/probe.ts` → `dist/<target>/scripts/probe.js`.
  3. Writes the merged `manifest.json`.
  4. Zips the result to `dist/<target>.zip`.

  `npm run build` builds both targets.
- Permissions are `scripting`, `tabs`, `browsingData`, plus `host_permissions: ["<all_urls>"]`. `contextMenus` and `activeTab` are dropped because they are unused.
- Firefox gets `browser_specific_settings.gecko = { id, strict_min_version: "109.0" }`.

## Open point

The definitive `gecko.id` must be confirmed by the project owner before the first AMO submission, because changing it later breaks the update path. The placeholder is `bastienhub@gmail.com`.
