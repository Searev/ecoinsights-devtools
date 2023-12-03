import { isNotOnSamePage } from "../app/helpers/url.helper";
import {
  ContentScriptMessageType,
  ContentScriptMessage,
  BRIDGE_CONNECTION,
} from "../bridge/connexion";

const INJECTED_PROBE_TOKEN = "ecometrics-browser-probe";

function port() {
  let _port: chrome.runtime.Port | null = null;

  return () => {
    if (_port == undefined) {
      _port = chrome.runtime.connect({
        name: BRIDGE_CONNECTION,
      });
      _port.onDisconnect.addListener(() => {
        _port = null;
      });
    }

    return _port;
  };
}

function EcometricsProbe(port: () => chrome.runtime.Port) {
  console.log("EcometricsProbe: Init");
  const body = document.querySelector("body");

  const eventListener = (event: Event) => {
    console.log("EcometricsProbe: Register event listener");
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
        console.log("EcometricsProbe: send message", msg);
        port().postMessage(msg);
      }
    }

    if (form != null) {
      const msg: ContentScriptMessage = {
        type: ContentScriptMessageType.LINK_CLICKED,
        content: form.action,
      };
      console.log("EcometricsProbe: send message", msg);
      port().postMessage(msg);
    }
  };

  body?.addEventListener("click", eventListener);

  return {
    close: () => body?.removeEventListener("click", eventListener),
  };
}

if (window[INJECTED_PROBE_TOKEN] === undefined) {
  window[INJECTED_PROBE_TOKEN] === EcometricsProbe(port());
}
