import type { ProbeMessage } from "../shared/protocol";
import type { Closeable } from "../app/domain/models/closeable";
import { isNotOnSamePage } from "../app/helpers/url.helper";

export type NavigationIntent = ProbeMessage["event"];

const CHANGE_LOCATION_REGEX = /window\.location\.href\s*=\s*(["'])(.*?)\1/;

/**
 * Listens to clicks to know when a link is followed or a form submitted.
 * Every detected intent goes through `onIntent`.
 */
export function listenToNavigationIntents(
  doc: Document,
  onIntent: (intent: NavigationIntent) => void
): Closeable {
  const listener = (event: Event) => {
    const target = event.target as Element | null;
    if (target == null || typeof target.closest !== "function") return;

    const a = target.closest("a");
    const btn = target.closest("button");
    const form = target.closest("form");
    const currentUrl = doc.defaultView?.location.href ?? doc.location.href;
    const mouse = event as MouseEvent;

    // Same-page links, new-tab links (target=_blank, ctrl/meta-click) are not navigations.
    if (
      a != null &&
      a.target !== "_blank" &&
      !mouse.ctrlKey &&
      !mouse.metaKey &&
      isNotOnSamePage(currentUrl, a.href)
    ) {
      onIntent({ kind: "link-clicked", url: a.href });
    }

    if (form != null && btn != null && btn.type === "submit") {
      onIntent({ kind: "form-submitted", url: form.action });
    }

    // Developers using <button onclick="window.location.href='some-url'"> as a link.
    if (btn != null) {
      const match = CHANGE_LOCATION_REGEX.exec(btn.getAttribute("onclick") ?? "");
      if (match != null) {
        const link = doc.createElement("a");
        link.href = match[2];
        if (isNotOnSamePage(currentUrl, link.href)) {
          onIntent({ kind: "link-clicked", url: link.href });
        }
      }
    }
  };

  doc.addEventListener("click", listener);
  return { close: () => doc.removeEventListener("click", listener) };
}
