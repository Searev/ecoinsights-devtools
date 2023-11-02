import { PageInfos } from "../domain/models/page-infos";
import { Closeable } from "../domain/models/closeable";
import { DomInfos } from "../domain/models/dom-infos";
import { NetworkRequest } from "../domain/models/network-request";
import { Browser } from "../domain/models/browser";
import { PageDescription } from "../domain/models/page-description";

const DOM_SCAN_INTERVAL_MS = 1000;

export async function getBrowserManifestV3(): Promise<BrowserChromeManifestV3> {
  return BrowserChromeManifestV3.instance ?? init();
}

async function init() {
  const queryOptions = { active: true, lastFocusedWindow: true };
  const [tab] = await chrome.tabs.query(queryOptions);
  const tabId = tab.id;
  if (tabId == null) {
    throw new Error("No tab id could be found");
  }

  const instance = new BrowserChromeManifestV3(tabId);

  BrowserChromeManifestV3.instance = instance;
  return instance;
}

class BrowserChromeManifestV3 implements Browser {
  static instance: BrowserChromeManifestV3 | undefined;
  private probePort: chrome.runtime.Port | undefined;

  constructor(private tabId: number) {
    /*
    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["scripts/probe-v3.js"],
    });

    this.probePort = chrome.runtime.connect({
      name: "ecometrics-browser",
    });
    this.probePort.onMessage.addListener((frameMeasures) => {
      this.logInConsole("Recerived message");
    });
    */
  }

  async getPageInfo(): Promise<PageInfos> {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: this.tabId },
      args: [],
      func: () => ({
        title: document.title,
        url: window.location.href,
        domSize: document.querySelectorAll("*:not(svg *)").length,
      }),
    });

    return res.result;
  }

  async getPageDescription(): Promise<PageDescription> {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: this.tabId },
      args: [],
      func: () => ({
        name: document.title,
        description:
          (
            document.querySelector(
              'meta[name="description"]'
            ) as HTMLMetaElement
          )?.content ?? "",
        url: window.location.origin,
      }),
    });

    return res.result;
  }

  getNetworkRequests(): Promise<NetworkRequest[]> {
    return new Promise((resolve) => {
      chrome.devtools.network.getHAR((har) => {
        const entries = har.entries.filter((entry) =>
          this.isNetworkResource(entry)
        );

        resolve(
          entries.map((entry: any) => ({
            method: entry.request.method ?? "",
            url: new URL(entry.request.url ?? ""),
            code: entry.response.status ?? 0,
            type: entry.response.content.mimeType ?? 0,
            responseSize: entry.response.content.size ?? 0,
            transferSize: entry.response._transferSize ?? 0,
          }))
        );
      });
    });
  }

  listenToDomProfile(
    onNewAnalysis: (
      domInfos: DomInfos,
      scannedPage: Omit<PageDescription, "description">
    ) => void
  ): Closeable {
    let isAnalysing = true;
    const analyseAndReprogram = async () => {
      if (!isAnalysing) {
        return;
      }

      const now = new Date();
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: this.tabId },
        args: [],
        func: () => ({
          domSize: document.querySelectorAll("*:not(svg *)").length,
          name: document.title,
          url: window.location.href,
        }),
      });
      onNewAnalysis(
        { domSize: res.result?.domSize ?? 0, date: now },
        { url: res.result?.url ?? "", name: res.result?.name ?? "" }
      );

      setTimeout(() => analyseAndReprogram(), DOM_SCAN_INTERVAL_MS);
    };

    analyseAndReprogram();

    return {
      close: () => {
        isAnalysing = false;
      },
    };
  }

  listenToNetworkRequests(
    onRequestDone: (request: NetworkRequest) => void
  ): Closeable {
    const processRequest = (entry: HARFormatEntry) => {
      onRequestDone({
        method: entry.request.method ?? "",
        url: new URL(entry.request.url ?? ""),
        code: entry.response.status ?? 0,
        type: entry.response.content.mimeType ?? 0,
        responseSize: entry.response.content.size ?? 0,
        transferSize: entry.response._transferSize ?? 0,
      });
    };

    chrome.devtools.network.onRequestFinished.addListener(processRequest);
    return {
      close: () =>
        chrome.devtools.network.onRequestFinished.removeListener(
          processRequest
        ),
    };
  }

  listenToUrlChanges(onChange: (newUrl: string) => void): Closeable {
    const proocessTabChange = (tabId: number, changeInfo: any) => {
      if (tabId === this.tabId && changeInfo.url) {
        onChange(changeInfo.url);
      }
    };

    chrome.tabs.onUpdated.addListener(proocessTabChange);

    return {
      close: () => {
        chrome.tabs.onUpdated.removeListener(proocessTabChange);
      },
    };
  }

  logInConsole(message: string): void {
    chrome.scripting.executeScript({
      target: { tabId: this.tabId },
      args: [message],
      func: (message: string) => console.log("Ecometrics : " + message),
    });
  }

  openUrlInNewTab(url: string): void {
    chrome.tabs.create({
      url,
    });
  }

  async refreshCurrentPage(): Promise<void> {
    await chrome.browsingData.remove(
      {},
      {
        cache: true,
        cookies: false,
        downloads: true,
        formData: false,
        history: false,
        indexedDB: false,
        localStorage: false,
        passwords: false,
        serviceWorkers: true,
      }
    );
    await chrome.tabs.reload(this.tabId, { bypassCache: true });
  }

  private isNetworkResource(harEntry: HARFormatEntry) {
    return !harEntry.request.url.startsWith("data");
  }
}
