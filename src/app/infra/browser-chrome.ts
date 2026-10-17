import { PageInfos } from "../domain/models/page-infos";
import { Closeable } from "../domain/models/closeable";
import { NetworkRequest } from "../domain/models/network-request";
import {
  BasicListener,
  Browser,
  NewAnalysisListener,
  RequestDoneListener,
  UrlChangeListener,
} from "../domain/models/browser";
import { PageDescription } from "../domain/models/page-description";
import {
  ContentScriptMessageType,
  ContentScriptMessage,
} from "../../bridge/connexion";
import { getPageInfo } from "../../scripts/shared/get-page-info";
import { getPageDescription } from "../../scripts/shared/get-page-description";
import { logInConsole } from "../../scripts/shared/log-in-console";
import BestPracticeAnalyzer from "../domain/best-practices/best-practices-analyzer";

const DOM_SCAN_INTERVAL_MS = 1000;

export async function getBrowserChrome(): Promise<BrowserChrome> {
  return BrowserChrome.instance ?? init();
}

async function init() {
  const queryOptions = { active: true, lastFocusedWindow: true };
  const [tab] = await chrome.tabs.query(queryOptions);
  const tabId = tab.id;
  if (tabId == null) {
    throw new Error("No tab id could be found");
  }

  const instance = new BrowserChrome(tabId);

  BrowserChrome.instance = instance;
  return instance;
}

class BrowserChrome implements Browser {
  static instance: BrowserChrome | undefined;
  onLinkClickListeners: Array<{ id: string; notify: BasicListener }> = [];
  onFormSubmittedListeners: Array<{ id: string; notify: BasicListener }> = [];

  constructor(private tabId: number) {
    this.initProbe();
    chrome.runtime.onMessage.addListener((message: ContentScriptMessage) => {
      switch (message.type) {
        case ContentScriptMessageType.LINK_CLICKED:
          this.onLinkClickListeners.forEach((listener) => listener.notify());
          break;
        case ContentScriptMessageType.FORM_SUBMITTED:
          this.onFormSubmittedListeners.forEach((listener) =>
            listener.notify()
          );
          break;
        default:
          break;
      }
    });
  }

  /**
   * On Chrome, Permissions are granted at installation time.
   */
  async checkPermission(): Promise<boolean> {
    return true;
  }

  initProbe() {
    chrome.scripting.executeScript({
      target: { tabId: this.tabId, allFrames: true },
      files: ["scripts/probe.js"],
    });
  }

  async getPageInfo(analyzer?: BestPracticeAnalyzer): Promise<PageInfos> {
    await analyzer?.analyzeFrame(this.tabId);
    return getPageInfo(this.tabId);
  }

  async getPageDescription(): Promise<PageDescription> {
    return getPageDescription(this.tabId);
  }

  getNetworkRequests(
    analyzer?: BestPracticeAnalyzer
  ): Promise<NetworkRequest[]> {
    return new Promise((resolve) => {
      chrome.devtools.network.getHAR((har) => {
        const entries = har.entries.filter((entry) =>
          this.isNetworkResource(entry)
        );

        entries.forEach((entry) => analyzer?.analyzeHarEntry(entry));

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
    onNewAnalysis: NewAnalysisListener,
    analyzer?: BestPracticeAnalyzer
  ): Closeable {
    let isAnalysing = true;
    const analyseAndReprogram = async () => {
      if (!isAnalysing) {
        return;
      }

      const now = new Date();
      const { domSize, url, title } = await getPageInfo(this.tabId);
      await analyzer?.analyzeFrame(this.tabId);

      onNewAnalysis({
        domInfos: { domSize: domSize ?? 0, date: now },
        scannedPage: {
          url: url ?? "",
          name: title ?? "",
        },
      });

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
    onRequestDone: RequestDoneListener,
    analyzer?: BestPracticeAnalyzer
  ): Closeable {
    const processRequest = (entry: HARFormatEntry) => {
      analyzer?.analyzeHarEntry(entry);
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

  listenToUrlChanges(onChange: UrlChangeListener): Closeable {
    const proocessTabChange = (tabId: number, changeInfo: any) => {
      if (tabId === this.tabId && changeInfo.url) {
        onChange(changeInfo.url);
        // We may have loaded a completely different HTML page; in which case we need to
        // inject the probe again.
        this.initProbe();
      }
    };

    chrome.tabs.onUpdated.addListener(proocessTabChange);

    return {
      close: () => {
        chrome.tabs.onUpdated.removeListener(proocessTabChange);
      },
    };
  }

  listenToLinkClicked(onLinkClicked: BasicListener): Closeable {
    const listener = {
      id: window.crypto.randomUUID().toString(),
      notify: onLinkClicked,
    };
    this.onLinkClickListeners.push(listener);
    return {
      close: () => {
        const index = this.onLinkClickListeners.indexOf(listener);
        this.onLinkClickListeners.splice(index, 1);
      },
    };
  }

  listenToFormSubmitted(onFormSubmitted: BasicListener): Closeable {
    const listener = {
      id: window.crypto.randomUUID().toString(),
      notify: onFormSubmitted,
    };
    this.onFormSubmittedListeners.push(listener);
    return {
      close: () => {
        const index = this.onFormSubmittedListeners.indexOf(listener);
        this.onFormSubmittedListeners.splice(index, 1);
      },
    };
  }

  logInConsole(message: string): void {
    logInConsole(this.tabId, message);
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

    const reloading = chrome.tabs.reload(this.tabId, { bypassCache: true });

    return new Promise((res, rej) => {
      // In order to resolve the promise only when the page is actually refreshed
      // and to inject the probe at the good time,
      // we have to wait for the status of the tab to be 'complete'.
      return reloading.then(
        () => {
          const injectOnReloadComplete = (
            _tabid: number,
            changeInfo: chrome.tabs.TabChangeInfo
          ) => {
            if (changeInfo.status === "complete") {
              this.initProbe();
              res();
              chrome.tabs.onUpdated.removeListener(injectOnReloadComplete);
            }
          };

          chrome.tabs.onUpdated.addListener(injectOnReloadComplete);
        },
        () => rej("An error occurred while reloading the page")
      );
    });
  }

  private isNetworkResource(harEntry: HARFormatEntry) {
    return !harEntry.request.url.startsWith("data");
  }
}
