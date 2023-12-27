import { PageAnalysis } from "../models/page-analysis";
import { computeEcoIndexAndEnvironmentalImpact } from "./ecoindex";
import { round } from "../../helpers/math.helpers";
import { NetworkRequest } from "../models/network-request";
import { DomProfile } from "../models/dom-infos";
import { getBrowser } from "../../infra/browser-factory";
import { PageInfos } from "../models/page-infos";
import { isNotOnSamePage } from "../../helpers/url.helper";
import { Closeable } from "../models/closeable";

export interface WebFlowAnalysisParams {
  refreshOnStart: boolean;
  triggerNewPageOnLinkClicked: boolean;
  triggerNewPageOnFormSubmitted: boolean;
}

export interface WebFlowAnalysis {
  /**
   * Marks the analysis of the current page as over. The network requests that will be after that
   * will count for the next page.
   */
  stopCurrentNavigation(): void;
  /**
   * Stops the analysis, and closes all active listeners..
   */
  stopAnalysis(): void;
}

/**
 * Analyse the current webpage, and notify the calling function of any news, regarding :
 * - the evolution of the size of the DOM
 * - the reception of any new request
 * - the navigation to new pages
 *
 * The ecoindex, with all its environmental indicators, is updated at real time with these informations.
 *
 * @param refreshOnStart If set to `true`, then the urrent tab will be refreshed, and its cache purged a the beggining of the analysis
 * @param consume Callback called as soon as a new analysis is available
 * @returns A set of functions used to handle the analysis, and stop it.
 */
export default async function analyseWebFlow(
  params: WebFlowAnalysisParams,
  consume: (analysis: PageAnalysis[]) => void
): Promise<WebFlowAnalysis> {
  const browser = await getBrowser();
  const [pageInfo, requests] = await Promise.all([
    browser.getPageInfo(),
    browser.getNetworkRequests(),
  ]);

  let previousAnalysis: PageAnalysis[] = [];
  let currentPageStartedAt = new Date();
  let currentPageInfos: PageInfos | null = pageInfo;
  let currentPageRequests: NetworkRequest[] = [];
  let currentDomProfile: DomProfile = [];
  let currentMaxDomSize = pageInfo.domSize;

  let hasBeenStopped = false;

  if (params.refreshOnStart) {
    await browser.refreshCurrentPage();
    const requestsToRefreshPage = await browser.getNetworkRequests();
    currentPageRequests.push(...requestsToRefreshPage);
  } else {
    currentDomProfile.push({
      domSize: pageInfo.domSize,
      date: currentPageStartedAt,
    });
    currentPageRequests.push(...requests);
  }

  const sendAnalysis = () =>
    consume([
      ...previousAnalysis,
      createPageAnalysis(
        currentPageInfos,
        currentPageRequests,
        currentDomProfile,
        currentMaxDomSize,
        currentPageStartedAt
      ),
    ]);

  sendAnalysis();

  const resetCurrentAnalysis = (pageInfos: PageInfos | null = null) => {
    currentPageStartedAt = new Date();
    currentPageInfos = pageInfos;
    currentPageRequests = [];
    currentDomProfile = [];
    currentMaxDomSize = 0;
  };

  const onClosePage = (newPageInfos: PageInfos | null = null) => {
    if (currentPageInfos == null) {
      return;
    }

    const currentAnalysis = createPageAnalysis(
      currentPageInfos,
      currentPageRequests,
      currentDomProfile,
      currentMaxDomSize,
      currentPageStartedAt
    );
    previousAnalysis = [...previousAnalysis, currentAnalysis];
    resetCurrentAnalysis(newPageInfos);
    sendAnalysis();
  };

  const listeners: Closeable[] = [];

  const networkListener = browser.listenToNetworkRequests((request) => {
    currentPageRequests.push(request);
    sendAnalysis();
  });
  listeners.push(networkListener);

  const urlChangeListener = browser.listenToUrlChanges(async (changedUrl) => {
    const newInfos = await browser.getPageInfo();

    if (currentPageInfos == null) {
      currentPageInfos = newInfos;
      currentDomProfile = [{ domSize: newInfos.domSize, date: new Date() }];
      currentMaxDomSize = newInfos.domSize;
      sendAnalysis();
    } else if (isNotOnSamePage(currentPageInfos.url, changedUrl)) {
      onClosePage(newInfos);
    }
  });
  listeners.push(urlChangeListener);

  const domListener = browser.listenToDomProfile(
    ({ domInfos, scannedPage }) => {
      if (scannedPage.url === currentPageInfos?.url) {
        if (
          currentDomProfile.length === 0 ||
          domInfos.domSize !=
            currentDomProfile[currentDomProfile.length - 1].domSize
        ) {
          currentDomProfile.push(domInfos);
        } else {
          currentDomProfile[currentDomProfile.length - 1] = domInfos;
        }
        if (currentMaxDomSize < domInfos.domSize) {
          currentMaxDomSize = domInfos.domSize;
        }
        // The name of the page isn't always up to date when the url changes. If we find
        // a new name for this URL, we us it a the new title
        if (currentPageInfos.title != scannedPage.name) {
          currentPageInfos.title = scannedPage.name;
        }
        sendAnalysis();
      } else {
        console.log(
          "Ignoring analysis, got infos on " +
            scannedPage.url +
            " but is navigation to " +
            currentPageInfos?.url
        );
      }
    }
  );
  listeners.push(domListener);

  if (params.triggerNewPageOnLinkClicked) {
    const linkClickedListener = browser.listenToLinkClicked(() => {
      onClosePage();
    });
    listeners.push(linkClickedListener);
  }

  if (params.triggerNewPageOnLinkClicked) {
    const formSubmittedListener = browser.listenToFormSubmitted(() => {
      onClosePage();
    });
    listeners.push(formSubmittedListener);
  }

  return {
    stopCurrentNavigation: () => onClosePage(),
    stopAnalysis: () => {
      if (!hasBeenStopped) {
        listeners.forEach((listener) => listener.close());
        hasBeenStopped = true;
      }
    },
  };
}

function createPageAnalysis(
  pageInfo: PageInfos | null,
  requests: NetworkRequest[],
  domProfile: DomProfile,
  maxDomSize: number,
  navigatedAt: Date
): PageAnalysis {
  const requestSizeInKb =
    (requests.reduce((acc, r) => acc + r.responseSize, 0) ?? 0) / 1e3;

  const impact = computeEcoIndexAndEnvironmentalImpact(
    maxDomSize ?? 0,
    requests.length ?? 0,
    requestSizeInKb
  );

  return {
    title: pageInfo?.title ?? "(En attente)",
    url: pageInfo?.url ?? "(En attente)",
    navigatedAt,
    requests: requests,
    domProfile: [...domProfile],
    maxDomSize,
    requestSizeInKb: round(requestSizeInKb),
    impact,
  };
}
