# ARCH-DECISION-021: One app-level dialog host serves the comparison and every preview; each body owns a pure controller

- **Status:** Accepted (EPIC-PV, US-015 to US-018)
- **Amends:** [ARCH-DECISION-016](ARCH-DECISION-016-comparison-dialog-host.md) (the comparison dialog becomes one body of a generic host)

## Context

- Epic §2 asks for **one modal for the app**:
  - a native `<dialog>` opened with `showModal()`, labelled by its title;
  - Escape, a backdrop click and "Fermer" close it, and focus returns to the trigger;
  - a second opening is impossible, and a double click opens it once.
- Epic §3 gives every preview the same header as the comparison: the shortened name (full name in `title` and for screen readers), then the full URL.
- Five contents now share it: comparison (US-005), image (US-015), video or sound (US-016), iframe data (US-017) and font (US-018). Their states differ:
  - comparison: per-version loads;
  - image and font: one load, plus a toggle for the font;
  - media: events from the native player;
  - iframe: synchronous.
- The reasons of 016 still hold. Live updates re-create the lines, so the dialog cannot live inside a line. There are no Solid component tests, so all behaviour must sit in pure `.ts`.

Options considered:

1. **One `<dialog>` per content.** Rejected: five copies of the shell (Escape, backdrop, focus return, header), and five modal elements, against epic §2.
2. **One controller for every content.** Rejected: a union of five state machines in one module, hard to test and to change independently.
3. **One host for the shell, one body per content, each with its own pure controller (chosen).**

## Decision

- **Host** (`ui/analysis/dialog/`):
  - `dialog-host.ts` (pure): `createDialogHost()` holds `{ open, request?, key?, opening }`.
    - `DialogRequest` is `{ kind: "comparison"; subject: ComparisonSubject }` or `{ kind: "preview"; subject: PreviewSubject }`.
    - `open(request, key?)` returns false and changes nothing while a dialog is open, which covers the double click.
    - `close()` is idempotent. `opening` increments on each open.
    - Helpers: `dialogKey(ruleId, url)` (`"ruleId|url"`) and `dialogTitle(request)` (`displayImageName(subject.url)`).
  - `DialogHost.tsx` (`AppDialogProvider`, `useAppDialog()`), mounted once in `src/app/index.tsx` around `<App/>`:
    - it renders the single `<dialog aria-labelledby>` with the header of epic §3 (`<h2>` with the short name `aria-hidden`, the full name `sr-only`, `title` = full name; then the full URL, selectable, `break-all`), the body and the "Fermer" button;
    - Escape (`cancel`, default prevented) and a backdrop click (`event.target === dialog`) close it;
    - focus returns to the trigger, else to the re-rendered element with the same `data-dialog-key`. `data-comparison-key` is renamed.
  - `useAppDialog()` exposes `openComparison(subject, trigger)` and `openPreview(subject, trigger)`. `useImageComparison()` and `ImageComparisonProvider` are removed.
- **Bodies** are mounted for one opening (`<Switch>` keyed by `opening`) and unmounted on close:
  - `ComparisonBody` (ex-`ComparisonDialog` without its `<dialog>`, header and close button). It drives the **unchanged** `createComparisonController`: `open(subject)` on mount, `close()` on cleanup.
  - `ImagePreviewBody`, `MediaPreviewBody`, `IframePreviewBody` and `FontPreviewBody` (`ui/analysis/preview/`). Each creates its pure controller on mount and calls `close()` in `onCleanup`. Closing releases what the opening created (object URLs, the registered font, the media download) and makes late results no-ops (epic §7).
  - Bodies receive what they need as props: the subject, and the `PreviewFileStore` or `ImageVariantStore`. They never import the host.
- **Lines:** `ImageName` renders a `<button aria-haspopup="dialog" data-dialog-key>` when it has a comparison subject (image rules, unchanged) or a preview subject (BP2 file lines). Otherwise it renders the existing non-interactive span.

## Consequences

- The comparison behaves exactly as before; its controller and its tests are untouched.
- A new kind of preview means one body and one `<Match>` in the host.
- The dialog shell and the focus logic exist once. Manual checks cover the `.tsx` wiring.
