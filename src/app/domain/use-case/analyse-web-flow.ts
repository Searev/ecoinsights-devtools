import { PageAnalysis } from "../models/page-analysis";
import { computeEcoIndexAndEnvironmentalImpact } from "./ecoindex";
import { round } from "../../helpers/math.helpers";
import { NetworkRequest } from "../models/network-request";
import { DomProfile } from "../models/dom-infos";
import { getBrowser } from "../../infra/browser-factory";
import { PageInfos } from "../models/page-infos";

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
  refreshOnStart: boolean,
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

  if (refreshOnStart) {
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

  const networkListener = browser.listenToNetworkRequests((request) => {
    currentPageRequests.push(request);
    sendAnalysis();
  });

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

  const domListener = browser.listenToDomProfile((domInfos, scannedPage) => {
    if (scannedPage.url === currentPageInfos?.url) {
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
    }
  });

  return {
    stopCurrentNavigation: () => onClosePage(),
    stopAnalysis: () => {
      if (!hasBeenStopped) {
        networkListener.close();
        urlChangeListener.close();
        domListener.close();
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

function isNotOnSamePage(url1: string, url2: string) {
  const parsedUrl1 = new URL(url1);
  const parsedUrl2 = new URL(url2);

  // On ignore les navigations vers des ancres particulières.
  return (
    parsedUrl1.origin !== parsedUrl2.origin ||
    parsedUrl1.pathname !== parsedUrl2.pathname ||
    parsedUrl1.search !== parsedUrl2.search
  );
}
