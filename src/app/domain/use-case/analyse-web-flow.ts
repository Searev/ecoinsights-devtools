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
   * Marque l'analyse de la page en cours comme terminée. Les requêtes qui seront interceptées
   * compteront alors pour la page d'après.
   */
  stopCurrentNavigation(): void;
  /**
   * Arrête l'analyse, et met fin à tous les listeners en cours.
   */
  stopAnalysis(): void;
}

/**
 * Analyse la page web actuelle, et notifie l'appelant de toute nouveauté, notamment :
 * - évolutions de la taille du DOM
 * - envoi/réception de nouvelles requêtes
 * - Navigation sur de nouvelles pages
 *
 * L'écoindex, avec ses indicateurs environnementaux associés, et mis à jour en temps réel
 * avec ces dernières informations.
 *
 * @param refreshOnStart Si `true`, alors l'onglet sera raffraîchit et son cache purgé au début de l'analyse
 * @param consume Callback appelé dès qu'une analyse plus récente est disponible
 * @returns Ensemble de callbacks pour gérer l'analyse et son arrêt.
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
        console.log("Adding new analysis");
        currentDomProfile.push(domInfos);
        if (currentMaxDomSize < domInfos.domSize) {
          currentMaxDomSize = domInfos.domSize;
        }
        // Le nom de la page n'est pas forcément à jour au moment où l'url a changé ;
        // si on détecte un nom plus à jour pour cette même URL, on l'applique donc.
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
      browser.logInConsole("Close page");
      onClosePage();
    });
    listeners.push(linkClickedListener);
  }

  if (params.triggerNewPageOnLinkClicked) {
    const formSubmittedListener = browser.listenToFormSubmitted(() => {
      browser.logInConsole("Close page");
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
