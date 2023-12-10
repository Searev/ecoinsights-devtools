import { isNotOnSamePage } from "../../app/helpers/url.helper";
import {
  ContentScriptMessage,
  ContentScriptMessageType,
} from "../../bridge/connexion";

const CHANGE_LOCATION_JS = "window.location.href=";

/**
 * Registers a listener on the body in order to know when a link is clicked or a form submitted.
 *
 * @param onLinkClicked Callback to call when a link to another page is clicked
 * @param onFormSubmitted Callback to call when a form (with an action) is submitted
 */
export function listenToNavigationAndForm(
  onLinkClicked: (nextUrl: string) => void,
  onFormSubmitted: (nextUrl: string) => void
) {
  const body = document.querySelector("body");

  const eventListener = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (target == null) return;

    const a = target.closest("a") as HTMLLinkElement | null;
    const btn = target.closest("button");
    const form = target.closest("form") as HTMLFormElement | null;

    const currentUrl = window.location.href;

    if (a != null) {
      const nextUrl = a.href;
      const target = a.target;

      // We do not notify a navigation event if the link redirects us to the same page
      // or if it opens in a new tab. We therefore do not handle "ctrl+click" events, which open
      // link in a new tab.
      if (
        isNotOnSamePage(currentUrl, nextUrl) &&
        target !== "_blank" &&
        !(event as MouseEvent)?.ctrlKey
      ) {
        onLinkClicked(nextUrl);
      }
    }

    if (form != null && btn != null && btn.type === "submit") {
      onFormSubmitted(form.action);
    }

    // I have... seen things you people wouldn't believe.
    // Developpers mistaking <button> for <a>
    // Using something onclick="window.location.href='some-url"
    // Let's try catching that "behavior"...
    if (btn != null) {
      const instructions =
        btn.attributes.getNamedItem("onclick")?.textContent?.split(";") ?? [];
      const changeLocationInstruction = instructions.find((el) =>
        el.includes(CHANGE_LOCATION_JS)
      );
      if (changeLocationInstruction != null) {
        // changeLocationInstruction is something like window.location.href="newurl.com/foobar"
        // We need to exclude the `"` from the URL we retrieve
        const link = document.createElement("a");
        link.href = changeLocationInstruction.substring(
          CHANGE_LOCATION_JS.length + 1,
          changeLocationInstruction.length - 1
        );
        const nextUrl = link.href;
        if (isNotOnSamePage(currentUrl, nextUrl)) {
          const msg: ContentScriptMessage = {
            type: ContentScriptMessageType.LINK_CLICKED,
            content: nextUrl,
          };
          chrome.runtime.sendMessage(msg);
        }
      }
    }
  };

  body?.addEventListener("click", eventListener);

  return {
    close: () => body?.removeEventListener("click", eventListener),
  };
}
