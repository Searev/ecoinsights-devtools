import { Browser } from "../domain/models/browser";
import { ExtensionBrowser } from "./extension-browser";
import { MockBrowser } from "./mock-browser";

const DEMO_INTERVAL_MS = 1000;

let _browser: Promise<Browser> | null = null;

/**
 * MockBrowser for `npm run dev`. The demo timer lives here, not in the class:
 * the DOM grows and a request is emitted every second.
 */
export function createDemoMockBrowser(): MockBrowser {
  const browser = new MockBrowser();
  let domSize = 100;
  setInterval(() => {
    domSize += Math.ceil(10 * Math.random());
    browser.setPageInfo({
      title: "Mocked page",
      url: "https://www.example.org",
      domSize,
    });
    browser.emitNetworkRequest({
      method: "GET",
      url: new URL("https://developer.chrome.com/docs/extensions/mv3/manifest/"),
      code: 200,
      type: "text/html",
      responseSize: 140_360,
      transferSize: 33_030,
    });
  }, DEMO_INTERVAL_MS);
  return browser;
}

function create(): Browser {
  const extensionApi = (globalThis as any).chrome;
  if (extensionApi?.devtools?.inspectedWindow) {
    return new ExtensionBrowser({
      runtime: extensionApi.runtime,
      devtools: extensionApi.devtools,
    });
  }
  return createDemoMockBrowser();
}

export function getBrowser(): Promise<Browser> {
  if (_browser == null) {
    _browser = Promise.resolve().then(create);
  }
  return _browser;
}
