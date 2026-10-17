// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Extending_the_developer_tools#working_with_content_scripts

import {
  DevtoolsCommandType,
  DevtoolCommand,
  ContentScriptMessage,
  BackgroundMessage,
} from "../bridge/connexion";
import { getPageDescription } from "./shared/get-page-description";
import { getPageInfo } from "./shared/get-page-info";
import { getPrintStylesheetNumber } from "./shared/rules/get-print-stylesheet-number";
import { logInConsole } from "./shared/log-in-console";

const DOM_SCAN_INTERVAL_MS = 1_000;

interface Subscription {
  tabId: number;
  close: () => void;
}

type Subscriptions = Subscription[];

/**
 * The bridge allows for communicating between the SolidJS App, executed in the DevTools, and content scripts that
 * may be injected.
 * Two communication channels exist :
 * - The first one allow the app to execute a function in the context of the page, and retrieve its results
 * - The second allows the app to listen to messages sent from a content script injected into this page.
 */
class Bridge {
  // Maps the DevTools port to the tab ID
  devToolsConnections: Map<number, chrome.runtime.Port> = new Map();

  private _domProfileSubscriptions: Subscriptions = [];
  private _urlChangesSubscriptions: Subscriptions = [];

  constructor() {
    console.log("EceInsights Bridge Created !");
    this.listenToContentScriptMessages();
    this.listenToDevToolsCommands();
  }

  private listenToDevToolsCommands() {
    chrome.runtime.onConnect.addListener((devToolsConnection) => {
      const listener = (message: DevtoolCommand, port: chrome.runtime.Port) => {
        if (this.devToolsConnections.get(message.tabId) == null) {
          this.devToolsConnections.set(message.tabId, port);
        }

        switch (message.command) {
          case DevtoolsCommandType.CHECK_PERMISSION:
            this.checkPermission(message.tabId).then((response) =>
              this.sendMessageToDevTools(message.tabId, {
                origin: "command",
                context: message,
                response,
              })
            );
            break;
          case DevtoolsCommandType.GET_PAGE_INFO:
            getPageInfo(message.tabId).then((response) =>
              this.sendMessageToDevTools(message.tabId, {
                origin: "command",
                context: message,
                response,
              })
            );
            break;
          case DevtoolsCommandType.GET_PAGE_DESCRIPTION:
            getPageDescription(message.tabId).then((response) =>
              this.sendMessageToDevTools(message.tabId, {
                origin: "command",
                context: message,
                response,
              })
            );
            break;
          case DevtoolsCommandType.GET_PAGE_DOM_SIZE:
            this.getPageDomSize(message.tabId).then((response) =>
              this.sendMessageToDevTools(message.tabId, {
                origin: "command",
                context: message,
                response,
              })
            );
            break;
          case DevtoolsCommandType.LISTEN_DOM_PROFILE:
            this.listenToDomProfile(message);
            break;
          case DevtoolsCommandType.LISTEN_URL_CHANGES:
            this.listenToUrlChanges(message);
            break;
          case DevtoolsCommandType.STOP_LISTEN_DOM_PROFILE:
            this.stopListeningToDomProfile(message.tabId);
            break;
          case DevtoolsCommandType.STOP_LISTEN_URL_CHANGES:
            this.stopListeningToUrlChanges(message.tabId);
            break;
          case DevtoolsCommandType.LOG_INTO_CONSOLE:
            logInConsole(message.tabId, message.extra);
            break;
          case DevtoolsCommandType.REFRESH_PAGE:
            this.refreshPage(message.tabId);
            break;
          case DevtoolsCommandType.CHECK_BEST_PRACTICES:
            this.checkBestPractices(message.tabId).then((response) =>
              this.sendMessageToDevTools(message.tabId, {
                origin: "command",
                context: message,
                response,
              })
            );
            break;
          default:
            break;
        }
      };

      devToolsConnection.onMessage.addListener(listener);
      devToolsConnection.onDisconnect.addListener((port) => {
        devToolsConnection.onMessage.removeListener(listener);
        const entry = [...this.devToolsConnections.entries()].find(
          (el) => el[1] == port
        );
        if (entry != null) {
          const tabId = entry[0];
          this.devToolsConnections.delete(tabId);
          this.stopListeningToDomProfile(entry?.[0]);
          this.stopListeningToUrlChanges(entry?.[0]);
        }
      });
    });
  }

  listenToDomProfile(message: DevtoolCommand) {
    let isAnalysing = true;
    const analyseAndReprogram = async () => {
      if (!isAnalysing) {
        return;
      }

      const now = new Date();
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: message.tabId },
        args: [],
        func: () => ({
          domSize: document.querySelectorAll("*:not(svg *)").length,
          name: document.title,
          url: window.location.href,
        }),
      });
      this.sendMessageToDevTools(message.tabId, {
        origin: "command",
        context: message,
        response: {
          domInfos: { domSize: res.result?.domSize ?? 0, date: now },
          scannedPage: {
            url: res.result?.url ?? "",
            name: res.result?.name ?? "",
          },
        },
      });

      setTimeout(() => analyseAndReprogram(), DOM_SCAN_INTERVAL_MS);
    };

    analyseAndReprogram();

    this._domProfileSubscriptions.push({
      tabId: message.tabId,
      close: () => {
        isAnalysing = false;
      },
    });
  }

  listenToUrlChanges(message: DevtoolCommand) {
    const proocessTabChange = (tabId: number, changeInfo: any) => {
      if (tabId === message.tabId && changeInfo.url) {
        this.sendMessageToDevTools(message.tabId, {
          origin: "command",
          context: message,
          response: changeInfo.url,
        });
      }
    };

    chrome.tabs.onUpdated.addListener(proocessTabChange);

    this._domProfileSubscriptions.push({
      tabId: message.tabId,
      close: () => {
        chrome.tabs.onUpdated.removeListener(proocessTabChange);
      },
    });
  }

  stopListeningToDomProfile(tabId: number) {
    this._domProfileSubscriptions.forEach((subscription) => {
      if (subscription.tabId === tabId) {
        subscription.close();
      }
    });

    this._domProfileSubscriptions = this._domProfileSubscriptions.filter(
      (el) => el.tabId === tabId
    );
  }

  stopListeningToUrlChanges(tabId: number) {
    this._urlChangesSubscriptions.forEach((subscription) => {
      if (subscription.tabId === tabId) {
        subscription.close();
      }
    });

    this._urlChangesSubscriptions = this._urlChangesSubscriptions.filter(
      (el) => el.tabId === tabId
    );
  }

  private listenToContentScriptMessages() {
    const handleMessage = (
      message: ContentScriptMessage,
      sender: chrome.runtime.MessageSender
    ) => {
      if (sender.tab) {
        const tabId = sender.tab.id;
        if (tabId == null) return;
        this.sendMessageToDevTools(tabId, {
          origin: "content-script",
          tabId,
          message,
        });
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  private sendMessageToDevTools(tabId: number, message: BackgroundMessage) {
    const port = this.devToolsConnections.get(tabId);
    if (port == null) return;

    port.postMessage(message);
  }

  private async checkPermission(tabId: number): Promise<boolean> {
    const tabs = await chrome.tabs.query({ currentWindow: true, active: true });
    const tab = tabs.find((el) => el.id === tabId);
    const origin =
      tab?.url != null ? new URL(tab.url).origin + "/" : "<all_urls>";

    const permissionsToRequest = {
      permissions: ["activeTab"],
      origins: [origin],
    };

    return chrome.permissions.contains(permissionsToRequest);
  }

  private async getPageDomSize(tabId: number): Promise<{
    domSize: number;
    name: string;
    url: string;
  }> {
    const { title, url, domSize } = await getPageInfo(tabId);
    return { name: title, url, domSize };
  }

  private async refreshPage(tabId: number) {
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

    chrome.tabs.reload(tabId, { bypassCache: true });
  }

  private async checkBestPractices(tabId: number) {
    const nbStylesheets = await getPrintStylesheetNumber(tabId);
    return {
      stylesheets: {
        checked: nbStylesheets > 0,
      },
    };
  }
}

new Bridge();
