import { Browser } from "../domain/models/browser";
import { getBrowserFirefox } from "./browser-firefox";
import { getBrowserChrome } from "./browser-chrome";
import { getBrowserMock } from "./browser-mock";

let _browser: Browser | null = null;

async function initBrowser() {
  const browserInstance = window.chrome || (window as any)["browser"];
  if (browserInstance?.scripting != null) {
    return getBrowserChrome();
  }

  if (browserInstance != null) {
    return getBrowserFirefox();
  }

  return getBrowserMock();
}

export async function getBrowser(): Promise<Browser> {
  if (_browser == null) {
    _browser = await initBrowser();
  }

  return _browser;
}
