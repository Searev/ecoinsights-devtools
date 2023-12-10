import {
  ContentScriptMessageType,
  ContentScriptMessage,
} from "../bridge/connexion";
import { listenToNavigationAndForm } from "./shared/onclick-listener";

const INJECTED_PROBE_TOKEN = "ecometrics-browser-probe";

/**
 * Content scripts injected into Chrome can interact directly with the
 * DevTools scripts using `chrome.runtime.sendMesage`
 */
function EcometricsProbe() {
  const { close } = listenToNavigationAndForm(
    (nextUrl) => {
      const msg: ContentScriptMessage = {
        type: ContentScriptMessageType.LINK_CLICKED,
        content: nextUrl,
      };
      chrome.runtime.sendMessage(msg);
    },
    (actionUrl) => {
      const msg: ContentScriptMessage = {
        type: ContentScriptMessageType.LINK_CLICKED,
        content: actionUrl,
      };
      chrome.runtime.sendMessage(msg);
    }
  );

  return { close };
}

// We try to have a single instance of the probe running
if (window[INJECTED_PROBE_TOKEN] === undefined) {
  window[INJECTED_PROBE_TOKEN] === EcometricsProbe();
}
