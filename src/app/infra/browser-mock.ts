import { PageInfos } from "../domain/models/page-infos";
import { Closeable } from "../domain/models/closeable";
import { DomInfos } from "../domain/models/dom-infos";
import { NetworkRequest } from "../domain/models/network-request";
import { Browser } from "../domain/models/browser";
import { PageDescription } from "../domain/models/page-description";

const EVENT_INTERVAL = 1000;
const NETWORK_REQUEST = {
  method: "GET",
  url: new URL("https://developer.chrome.com/docs/extensions/mv3/manifest/"),
  code: 200,
  type: "text/html",
  responseSize: 140_360,
  transferSize: 33_030,
};

export async function getBrowserMock(): Promise<BrowserMock> {
  return BrowserMock.instance ?? init();
}

async function init() {
  const instance = new BrowserMock();

  BrowserMock.instance = instance;
  return instance;
}

class BrowserMock implements Browser {
  static instance: BrowserMock | undefined;

  async getPageInfo(): Promise<PageInfos> {
    return {
      title: "Mocked page",
      url: "www.example.org",
      domSize: 100,
    };
  }

  async getPageDescription(): Promise<PageDescription> {
    return {
      name: "Mocked page",
      description: "A mocked service in order to test the app",
      url: "www.example.org",
    };
  }

  async getNetworkRequests(): Promise<NetworkRequest[]> {
    const requests: NetworkRequest[] = [];
    for (let i = 0; i < 10; i++) {
      requests.push(NETWORK_REQUEST);
    }
    return requests;
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

      onNewAnalysis(
        { domSize: 100 + Math.ceil(10 * Math.random()), date: new Date() },
        {
          name: "Mocked page",
          url: "www.example.org",
        }
      );

      setTimeout(() => analyseAndReprogram(), EVENT_INTERVAL);
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
    let isAnalysing = true;
    const analyseAndReprogram = async () => {
      if (!isAnalysing) {
        return;
      }

      onRequestDone(NETWORK_REQUEST);
      setTimeout(() => analyseAndReprogram(), EVENT_INTERVAL);
    };

    analyseAndReprogram();

    return {
      close: () => {
        isAnalysing = false;
      },
    };
  }

  listenToUrlChanges(onChange: (newUrl: string) => void): Closeable {
    return {
      close: () => {},
    };
  }

  logInConsole(message: string): void {
    console.log("Ecometrics : " + message);
  }

  openUrlInNewTab(url: string): void {
    window.open(url);
  }

  async refreshCurrentPage(): Promise<void> {}
}
