// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Extending_the_developer_tools#working_with_content_scripts

import { PageInfos } from "../app/domain/models/page-infos";
import {
  DevtoolsCommandType,
  DevtoolCommand,
  ContentScriptMessage,
  BackgroundMessage,
} from "../bridge/connexion";

const DOM_SCAN_INTERVAL_MS = 1_000;

interface Subscription {
  tabId: number;
  close: () => void;
}

type Subscriptions = Subscription[];

/**
 * Le bridge permet une communication asynchrone entre l'application, executée dans les DevTools,
 * et les scripts de contenus qui peuvent être injectés.
 *
 * Deux canneaux de communication existent :
 * - Le premier permet à l'application d'exécuter une fonction dans le contexte de la page, et d'en
 *   récupérer le résultat.
 * - Le second permet à l'application d'écouter les messages envoyés par un script de contenu présent
 *   sur la page
 */
class Bridge {
  // Maps the DevTools port to the tab ID
  devToolsConnections: Map<number, chrome.runtime.Port> = new Map();

  private _domProfileSubscriptions: Subscriptions = [];
  private _urlChangesSubscriptions: Subscriptions = [];

  constructor() {
    console.log("Ecometrics bridge enabled !");
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
          case DevtoolsCommandType.GET_PAGE_INFO:
            console.log("🚩 received GET_PAGE_INFO");
            this.getPageInfo(message.tabId).then((response) =>
              this.sendMessageToDevTools(message.tabId, {
                origin: "command",
                context: message,
                response,
              })
            );
            break;
          case DevtoolsCommandType.GET_PAGE_DESCRIPTION:
            console.log("🚩 received GET_PAGE_DESCRIPTION");
            this.getPageDescription(message.tabId).then((response) =>
              this.sendMessageToDevTools(message.tabId, {
                origin: "command",
                context: message,
                response,
              })
            );
            break;
          case DevtoolsCommandType.GET_PAGE_DOM_SIZE:
            console.log("🚩 received GET_PAGE_DOM_SIZE");
            this.getPageDomSize(message.tabId).then((response) =>
              this.sendMessageToDevTools(message.tabId, {
                origin: "command",
                context: message,
                response,
              })
            );
            break;
          case DevtoolsCommandType.LISTEN_DOM_PROFILE:
            console.log("🚩 received LISTEN_DOM_PROFILE");
            this.listenToDomProfile(message);
            break;
          case DevtoolsCommandType.LISTEN_URL_CHANGES:
            console.log("🚩 received LISTEN_URL_CHANGES");
            this.listenToUrlChanges(message);
            break;
          case DevtoolsCommandType.STOP_LISTEN_DOM_PROFILE:
            console.log("🚩 received STOP_LISTEN_DOM_PROFILE");
            this.stopListeningToDomProfile(message.tabId);
            break;
          case DevtoolsCommandType.STOP_LISTEN_URL_CHANGES:
            console.log("🚩 received STOP_LISTEN_URL_CHANGES");
            this.stopListeningToUrlChanges(message.tabId);
            break;
          case DevtoolsCommandType.LOG_INTO_CONSOLE:
            console.log("🚩 received LOG_INTO_CONSOLE");
            chrome.scripting.executeScript({
              target: { tabId: message.tabId },
              args: [message.extra],
              func: (message: string) => console.log("Ecometrics : " + message),
            });
            break;
          case DevtoolsCommandType.REFRESH_PAGE:
            console.log("🚩 received REFRESH_PAGE");
            this.refreshPage(message.tabId);
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
        // Message was received from Content Script
      } else {
        // Message was received from Devtools
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  private sendMessageToDevTools(tabId: number, message: BackgroundMessage) {
    //console.log("🚩 -> Send message to devTools", message);
    const port = this.devToolsConnections.get(tabId);
    if (port == null) return;

    port.postMessage(message);
  }

  private async getPageInfo(tabId: number): Promise<PageInfos> {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        title: document.title,
        url: window.location.href,
        domSize: document.querySelectorAll("*:not(svg *)").length,
      }),
    });

    return res.result;
  }

  private async getPageDescription(tabId: number): Promise<{
    name: string;
    description: string;
    url: string;
  }> {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
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

  private async getPageDomSize(tabId: number): Promise<{
    domSize: number;
    name: string;
    url: string;
  }> {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        domSize: document.querySelectorAll("*:not(svg *)").length,
        name: document.title,
        url: window.location.href,
      }),
    });

    return res.result;
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
}

new Bridge();
