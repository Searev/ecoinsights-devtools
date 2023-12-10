import {
  ContentScriptMessageType,
  ContentScriptMessage,
  BRIDGE_CONNECTION,
} from "../bridge/connexion";
import { listenToNavigationAndForm } from "./shared/onclick-listener";

const INJECTED_PROBE_TOKEN = "ecometrics-browser-probe";

function portProvider() {
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

/**
 * Content scripts injected into Firefox cannot interact directly with
 * the Devtools : all messages must go through the background script.
 * Therefore, we transmit them through a `port`.
 */
function EcometricsProbe(port: () => chrome.runtime.Port) {
  const { close } = listenToNavigationAndForm(
    (nextUrl) => {
      const msg: ContentScriptMessage = {
        type: ContentScriptMessageType.LINK_CLICKED,
        content: nextUrl,
      };
      port().postMessage(msg);
    },
    (actionUrl) => {
      const msg: ContentScriptMessage = {
        type: ContentScriptMessageType.LINK_CLICKED,
        content: actionUrl,
      };
      port().postMessage(msg);
    }
  );

  return { close };
}

// We try to have a single instance of the probe running
if (window[INJECTED_PROBE_TOKEN] === undefined) {
  window[INJECTED_PROBE_TOKEN] === EcometricsProbe(portProvider());
}
