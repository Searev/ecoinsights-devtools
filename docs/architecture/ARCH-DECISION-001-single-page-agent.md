# ARCH-DECISION-001: One background Page agent and one DevTools adapter for Chrome and Firefox

- **Status:** Accepted (REFACTOR-001)
- **Supersedes:** the split `BrowserChrome` / `BrowserFirefox` adapters

## Context

- Firefox DevTools pages cannot call `scripting` or `tabs`.
- Chrome DevTools pages can in practice, but Chrome documents them as limited to the content-script API subset.

The project solved this with two adapters, one calling `chrome.scripting` directly (Chrome) and one relaying through a background script (Firefox). Every capability was written 2 to 3 times, and the copies drifted:

- best practices never run on Firefox;
- reload resolves early on Firefox;
- the permission check is fake on Chrome;
- the Chrome tab lookup breaks with undocked DevTools.

See the review, §3.1.

## Decision

- All page and tab access goes through **one background module, the Page agent**, on both browsers. Chrome registers it as an MV3 `service_worker` and Firefox as `background.scripts`; the same bundle runs in both.
- The panel uses **one adapter, `ExtensionBrowser`**:
  - It talks to the Page agent over a `runtime.Port` (ARCH-DECISION-002).
  - It uses `chrome.devtools.network` directly, since that API is identical in both browsers and only available in DevTools contexts.
  - The tab id always comes from `chrome.devtools.inspectedWindow.tabId`.
- The Probe content script is **injected on demand** by the Page agent, top frame only. It is never declared statically in the manifest.
- `MockBrowser` remains the second adapter, for `npm run dev` and for tests.

## Consequences

- **Positive:**
  - A capability is implemented once.
  - A fix lands in both browsers.
  - Firefox no longer injects a script into every visited page.
- **Negative:**
  - Chrome now pays one message hop per page query, which is negligible at 1 Hz.
  - Chrome's service worker can be stopped when idle. Mitigation: the panel drives every request (the domain owns polling, ARCH-DECISION-003), so each request wakes the worker. No long-lived state in the worker matters beyond the per-port session, and `ExtensionBrowser` reconnects and re-subscribes after a disconnect.
- **Top frame only:** link clicks inside iframes, such as ads or embeds, no longer close the current page. This is intended: they rarely navigate the top document. Revisit if users report missed page boundaries.

## Alternatives rejected

- **Keep two adapters and share helpers:** this keeps two transports and the drift risk.
- **`devtools.inspectedWindow.eval`:** it runs in the page's main world, where page scripts can tamper with globals, and it cannot push events. A relay would still be needed for the Probe.
