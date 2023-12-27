import {
  ContentScriptMessageType,
  ContentScriptMessage,
} from "../bridge/connexion";
import { listenToNavigationAndForm } from "./shared/onclick-listener";

const INJECTED_PROBE_TOKEN = "ecoinsights-profiler-probe";

/**
 * Content scripts injected into Chrome can interact directly with the
 * DevTools scripts using `chrome.runtime.sendMesage`
 */
function EcoInsightsProbe() {
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
        type: ContentScriptMessageType.FORM_SUBMITTED,
        content: actionUrl,
      };
      chrome.runtime.sendMessage(msg);
    }
  );

  return { close };
}

// We try to have a single instance of the probe running
if (window[INJECTED_PROBE_TOKEN] === undefined) {
  window[INJECTED_PROBE_TOKEN] === EcoInsightsProbe();
}
