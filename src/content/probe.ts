import type { ProbeMessage } from "../shared/protocol";
import { listenToNavigationIntents } from "./navigation-listener";

const PROBE_TOKEN = "__ecoinsightsProbe";

/**
 * Content script injected by the Page agent. Reports navigation intents
 * through `chrome.runtime.sendMessage`; the Page agent forwards them to the panel.
 */
function startProbe() {
  return listenToNavigationIntents(document, (event) => {
    const message: ProbeMessage = { source: "ecoinsights-probe", event };
    chrome.runtime.sendMessage(message);
  });
}

const probeWindow = window as unknown as Record<string, unknown>;
// A single instance per page, even if the Probe is injected several times.
if (probeWindow[PROBE_TOKEN] === undefined) {
  probeWindow[PROBE_TOKEN] = startProbe();
}
