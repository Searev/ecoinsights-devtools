import { Browser } from "../domain/models/browser";
import { getBrowserManifestV3 } from "./browser-chrome-manifest-v3";
import { getBrowserMock } from "./browser-mock";

export async function getBrowser(): Promise<Browser> {
  const browserInstance = window.chrome || (window as any)["browser"];
  if (browserInstance == null) {
    return getBrowserMock();
  }
  return getBrowserManifestV3();
}
