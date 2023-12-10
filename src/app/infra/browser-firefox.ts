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
  BackgroundMessage,
  BRIDGE_CONNECTION,
  DevtoolCommand,
  DevtoolsCommandType,
  ContentScriptMessage,
  BackgroundCommandResponse,
} from "../../bridge/connexion";

type Listeners<T> = Array<{ id: string; listener: T }>;

export async function getBrowserFirefox(): Promise<BrowserFirefox> {
  return BrowserFirefox.instance ?? init();
}

async function init() {
  const tabId = chrome.devtools.inspectedWindow.tabId;
  const instance = new BrowserFirefox(tabId);

  BrowserFirefox.instance = instance;
  return instance;
}

/**
 * Unlinke Chrome extensions, Firefox DevTool scripts cannot access many of the browser.* APIs.
 * In order to do so, we need to rely on a background script and a content script.
 *
 * The content script is automatically injected in the web page thanks to its declaration in the manifest.
 *
 * All communication must go through the Background script.
 */
class BrowserFirefox implements Browser {
  static instance: BrowserFirefox | undefined;

  domProfileListener: Listeners<NewAnalysisListener> = [];
  requestDoneListener: Listeners<RequestDoneListener> = [];
  urlChangedListener: Listeners<UrlChangeListener> = [];
  onLinkClickListeners: Listeners<BasicListener> = [];
  onFormSubmittedListeners: Listeners<BasicListener> = [];

  pendingCommandPromises: Array<{
    command: DevtoolsCommandType;
    resolve: (res: any) => void;
  }> = [];

  private _port = chrome.runtime.connect({
    name: BRIDGE_CONNECTION,
  });

  constructor(private tabId: number) {
    /*
     * Messages can have multiple origins :
     *  - they can be emitted in reaction to a command given from this class
     *  - they can be emitted from the contentscript
     */
    this._port.onMessage.addListener((backgroundMessage: BackgroundMessage) => {
      switch (backgroundMessage.origin) {
        case "command":
          this.handleCommandResponse(backgroundMessage);
          break;
        case "content-script":
          this.handleContentScriptMessage(backgroundMessage.message);
          break;
        default:
          break;
      }
    });
  }

  /**
   * Checks if the user has allowed EcoMetrics to inject content script and gather data about
   * this website.
   * @returns Does the user have granted access to all page data ?
   */
  async checkPermission(): Promise<boolean> {
    return this.sendCommandAndWaitForResult(
      DevtoolsCommandType.CHECK_PERMISSION
    );
  }

  async getPageInfo(): Promise<PageInfos> {
    return this.sendCommandAndWaitForResult(DevtoolsCommandType.GET_PAGE_INFO);
  }

  async getPageDescription(): Promise<PageDescription> {
    return this.sendCommandAndWaitForResult(
      DevtoolsCommandType.GET_PAGE_DESCRIPTION
    );
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

  listenToDomProfile(onNewAnalysis: NewAnalysisListener): Closeable {
    this.sendCommand(DevtoolsCommandType.LISTEN_DOM_PROFILE);
    return this.addListener(
      onNewAnalysis,
      this.domProfileListener,
      DevtoolsCommandType.STOP_LISTEN_DOM_PROFILE
    );
  }

  listenToNetworkRequests(onRequestDone: RequestDoneListener): Closeable {
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

  listenToUrlChanges(onChange: UrlChangeListener): Closeable {
    this.sendCommand(DevtoolsCommandType.LISTEN_URL_CHANGES);
    return this.addListener(
      onChange,
      this.urlChangedListener,
      DevtoolsCommandType.STOP_LISTEN_URL_CHANGES
    );
  }

  listenToLinkClicked(onLinkClicked: BasicListener): Closeable {
    return this.addListener(onLinkClicked, this.onLinkClickListeners);
  }

  listenToFormSubmitted(onFormSubmitted: BasicListener): Closeable {
    return this.addListener(onFormSubmitted, this.onFormSubmittedListeners);
  }

  logInConsole(message: string): void {
    this.sendCommand(DevtoolsCommandType.LOG_INTO_CONSOLE, message);
  }

  openUrlInNewTab(url: string): void {
    chrome.tabs.create({
      url,
    });
  }

  async refreshCurrentPage(): Promise<void> {
    this.sendCommand(DevtoolsCommandType.REFRESH_PAGE);
  }

  /**
   * Handles a response transmitted through the Background Script.
   * Responses can be handled in two fashions :
   * - If the command was a `GET_*` one, we resolve the promise that was waiting for it
   * - If the command was a `LISTEN_*` one, we notify the listeners
   * @param response Response given from the Background script to handle
   */
  private handleCommandResponse(response: BackgroundCommandResponse) {
    switch (response.context.command) {
      case DevtoolsCommandType.CHECK_PERMISSION:
      case DevtoolsCommandType.GET_PAGE_INFO:
      case DevtoolsCommandType.GET_PAGE_DESCRIPTION:
      case DevtoolsCommandType.GET_PAGE_DOM_SIZE:
        this.pendingCommandPromises
          .filter((el) => el.command === response.context.command)
          .forEach(({ resolve }) => resolve(response.response));

        this.pendingCommandPromises = this.pendingCommandPromises.filter(
          (el) => el.command !== response.context.command
        );
        break;
      case DevtoolsCommandType.LISTEN_DOM_PROFILE:
        this.domProfileListener.forEach((el) => el.listener(response.response));
        break;
      case DevtoolsCommandType.LISTEN_URL_CHANGES:
        this.urlChangedListener.forEach((el) => el.listener(response.response));
        break;
      default:
        console.log(
          "Ecometrics browser : unhandled command response",
          response
        );
        break;
    }
  }

  private handleContentScriptMessage(message: ContentScriptMessage) {
    switch (message.type) {
      case ContentScriptMessageType.LINK_CLICKED:
        this.onLinkClickListeners.forEach((listener) => listener.listener());
        break;
      case ContentScriptMessageType.FORM_SUBMITTED:
        this.onFormSubmittedListeners.forEach((listener) =>
          listener.listener()
        );
        break;
      default:
        break;
    }
  }

  private sendCommand(commandType: DevtoolsCommandType, extra?: any) {
    const command: DevtoolCommand = {
      command: commandType,
      tabId: this.tabId,
      extra,
    };
    this._port.postMessage(command);
  }

  private sendCommandAndWaitForResult<T>(
    commandType: DevtoolsCommandType
  ): Promise<T> {
    this.sendCommand(commandType);

    return new Promise((resolve) => {
      this.pendingCommandPromises.push({
        command: commandType,
        resolve,
      });
    });
  }

  private addListener<T>(
    listener: T,
    listeners: Listeners<T>,
    closureCommand?: DevtoolsCommandType
  ): Closeable {
    const id = window.crypto.randomUUID().toString();
    const listenerWrapper = { id, listener };

    listeners.push(listenerWrapper);

    return {
      close: () => {
        const index = listeners.findIndex((el) => el.id === id);
        if (index >= 0) {
          listeners.splice(index, 1);
        }

        if (closureCommand) {
          this.sendCommand(closureCommand);
        }
      },
    };
  }

  private isNetworkResource(harEntry: HARFormatEntry) {
    return !harEntry.request.url.startsWith("data");
  }
}
