import { isNotOnSamePage } from "../app/helpers/url.helper";
import {
  ContentScriptMessageType,
  ContentScriptMessage,
} from "../bridge/connexion";

const INJECTED_PROBE_TOKEN = "ecometrics-browser-probe";

function EcometricsProbe() {
  console.log("EcometricsProbe: Init");
  const body = document.querySelector("body");

  const eventListener = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (target == null) return;

    const a = target.closest("a") as HTMLLinkElement | null;
    const form = target.closest("form") as HTMLFormElement | null;

    const currentUrl = window.location.href;

    if (a != null) {
      const nextUrl = a.href;
      const target = a.target;

      // On n'informe pas du clic sur le lien s'il nous ramène vers la même
      // page; ou si'il en ouvre une dans un autre onglet.
      if (isNotOnSamePage(currentUrl, nextUrl) && target !== "_blank") {
        const msg: ContentScriptMessage = {
          type: ContentScriptMessageType.LINK_CLICKED,
          content: nextUrl,
        };
        chrome.runtime.sendMessage(msg);
      }
    }

    if (form != null) {
      const msg: ContentScriptMessage = {
        type: ContentScriptMessageType.LINK_CLICKED,
        content: form.action,
      };
      chrome.runtime.sendMessage(msg);
    }
  };

  body?.addEventListener("click", eventListener);

  return {
    close: () => body?.removeEventListener("click", eventListener),
  };
}

if (window[INJECTED_PROBE_TOKEN] === undefined) {
  window[INJECTED_PROBE_TOKEN] === EcometricsProbe();
}
