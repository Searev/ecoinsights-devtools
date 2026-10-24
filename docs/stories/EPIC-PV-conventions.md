# Epic PV: preview the elements flagged by the best practices, shared conventions

These rules apply to stories **US-015 to US-018** and **US-020**. Each story only states what differs.

## Why

The BP2 rules (US-006 to US-014) list file names, but an auditor cannot tell *which* image has no alternative, *which* GIF weighs 900 kB or *what* a downloaded font looks like without hunting for it in the page. The image rules already open a comparison dialog (US-005). This epic gives the same "click the name to see it" experience to the other rules.

## Stories

| Story | Opens from | Modal content |
|---|---|---|
| US-015 | Image lines of US-006, US-007, US-013 | the image, with resolution, format, weight, and "Taille réelle" |
| US-016 | Video lines of US-006 and US-014; sound lines of US-014 | a player (never autoplays), with resolution, duration, format, weight |
| US-017 | Iframe lines of US-007 | data only: URL, type, weight, position |
| US-018 | Font lines of "Utiliser des polices standards" | the Voltaire quote in the font, with a toggle to system fonts |
| US-020 | "non minifié" lines of US-010 | the file content, syntax-coloured (JS, JSON, HTML/SVG, CSS), capped at 500 000 characters |

The stories are independent and can be delivered in any order. All of them rely on the shared preview dialog of §2.

## Conventions

1. **Trigger.**
   - In the listed rules, the **shortened name** of a line (US-004, ARCH-DECISION-017) becomes a `<button>`, styled like the US-005 comparison buttons. Click, Enter or Space opens the modal.
   - The rest of the line is unchanged.
   - **Not clickable** (plain text, as today):
     - lines without a file name: "(sans source)", domains, "… et N autres";
     - lines whose URL is not `http(s)`: `blob:`, `data:`. Their bytes belong to the page and cannot be read again;
     - `<area>` lines of US-006, since their URL is a link target, not an image.
   - The image rules' comparison buttons (US-005) are unchanged.
2. **One modal for the app** (ARCH-DECISION-016).
   - It is a native `<dialog>` opened with `showModal()`, labelled by its title. Focus is trapped inside it.
   - Escape, a click on the backdrop and the "Fermer" button close it; focus then returns to the button that opened it.
   - Opening a second preview while one is open is impossible, because the modal is modal. A rapid double click opens it once.
3. **Header.** The title is the US-004 shortened name, with the full name in `title` and for screen readers. Under it is the **full URL**: selectable, wrapping, never truncated.
4. **Information list.** Labels in French, values in French format:
   - weights through `formatKo` ("240 ko"; 1 kB = 1 000 bytes);
   - resolutions as `1200 × 800 px`;
   - an unknown value shows "inconnu(e)", and never an empty field.
5. **Data source.**
   - Bytes come from what DevTools captured for the page. Otherwise they are re-downloaded from the **HTTP cache when possible**, exactly like US-005 (ARCH-DECISION-010). Video and sound are streamed from their URL by the player (US-016).
   - Nothing is persisted, and nothing is sent to a third party.
   - Files are kept in memory for the panel session, in the existing comparison cache (50 MB, least recently used first). Reopening the same file is instant.
6. **Works on a recording in progress and on saved analyses**, including analyses saved before this epic, as long as their lines carry a file reference (`lineRefs`). For data this epic adds, an older analysis behaves as "unknown"; for example, an unknown display size opens in "Taille réelle".
7. **States** of the modal content:
   - `idle`: before opening;
   - `loading`: "Chargement…" with `role="status"`;
   - `loaded`;
   - `error`: a message with `role="alert"` and a **"Réessayer"** button that retries the load.
   - A late result after the modal closed is ignored. Object URLs and registered fonts are released on close.
8. **Wording.** UI strings in French, exactly as written in the stories.
9. **Testing.** As usual in this project, logic lives in pure, tested `.ts` helpers (state controller, formatting, layout). `.tsx` files are wiring only (no component tests).
