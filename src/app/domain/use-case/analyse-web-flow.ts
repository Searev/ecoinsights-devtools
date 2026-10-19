import { PageAnalysis } from "../models/page-analysis";
import { computeEcoIndexAndEnvironmentalImpact } from "./ecoindex";
import { round } from "../../helpers/math.helpers";
import { NetworkRequest } from "../models/network-request";
import { DomProfile } from "../models/dom-infos";
import { PageInfos } from "../models/page-infos";
import { isNotOnSamePage } from "../../helpers/url.helper";
import { Closeable } from "../models/closeable";
import { BestPractice } from "../models/best-practice";
import { Browser } from "../models/browser";
import { NavigationEvent } from "../models/navigation-event";
import { BestPracticeRule, CollectOutcome } from "../best-practices/rule";
import { RULES } from "../best-practices";
import {
  collectableRuleIds,
  evaluateRules,
  planEstimations,
} from "../best-practices/engine";
import { ImageEstimator } from "../models/image-estimator";
import { PageImageGain } from "../models/image-estimation";
import {
  EstimationQueue,
  createEstimationQueue,
} from "../image-estimation/estimation-queue";
import {
  computePageImageGain,
  planCombinedEstimations,
} from "../image-estimation/image-gain";

export interface WebFlowAnalysisParams {
  refreshOnStart: boolean;
  triggerNewPageOnLinkClicked: boolean;
  triggerNewPageOnFormSubmitted: boolean;
  checkBestPractices: boolean;
}

export interface WebFlowAnalysisOptions {
  rules?: readonly BestPracticeRule<any>[];
  /** Delay between two DOM-size samples. Default 1000. */
  domPollIntervalMs?: number;
  /** Minimum delay between two best-practice collections on the same page. Default 5000. */
  collectMinIntervalMs?: number;
  /**
   * Estimates image transformations for the image rules (ARCH-DECISION-007). When absent, every
   * estimation is `failed(estimator-unavailable)` and the image rules show "Non évaluée".
   */
  imageEstimator?: ImageEstimator;
}

export interface WebFlowAnalysis {
  /**
   * Marks the analysis of the current page as over. The network requests that will be after that
   * will count for the next page.
   */
  stopCurrentNavigation(): void;
  /**
   * Stops the analysis, and closes all active listeners and timers. Idempotent.
   * Pending image estimations become `skipped(analysis-stopped)` (US-001 scenario 12).
   * @returns the final page analyses, to be saved as is.
   */
  stopAnalysis(): PageAnalysis[];
}

/** DOM size change that triggers a new best-practice collection. */
const SIGNIFICANT_DOM_RATIO = 0.1;
const SIGNIFICANT_DOM_NODES = 50;

interface CurrentPage {
  info: PageInfos | null;
  startedAt: Date;
  requests: NetworkRequest[];
  domProfile: DomProfile;
  maxDomSize: number;
  pageData: Record<string, CollectOutcome>;
  lastCollectedDomSize: number;
  lastCollectedAt: number;
}

/** Everything a best-practice evaluation needs; kept for every page, closed ones included. */
interface EvaluationSnapshot {
  url: string;
  requests: NetworkRequest[];
  pageData: Record<string, CollectOutcome>;
}

/** A page closed by a navigation: frozen, except for its image estimations. */
interface ClosedPage {
  snapshot: EvaluationSnapshot;
  analysis: PageAnalysis;
  /** Estimation-queue version the best practices of `analysis` were built from. */
  builtAtVersion: number;
}

/** Estimator used when none is injected: every estimation fails, the image rules show "Non évaluée". */
const unavailableEstimator: ImageEstimator = {
  estimate: async () => ({ status: "failed", reason: "estimator-unavailable" }),
};

function newPage(info: PageInfos | null, seed: boolean): CurrentPage {
  const now = new Date();
  return {
    info,
    startedAt: now,
    requests: [],
    domProfile: info && seed ? [{ domSize: info.domSize, date: now }] : [],
    maxDomSize: info && seed ? info.domSize : 0,
    pageData: {},
    lastCollectedDomSize: info?.domSize ?? 0,
    lastCollectedAt: Number.NEGATIVE_INFINITY,
  };
}

/**
 * Analyse the current webpage, and notify the calling function of any news, regarding :
 * - the evolution of the size of the DOM (polled here, see ARCH-DECISION-003)
 * - the reception of any new request
 * - the navigation to new pages
 * - the best practices followed by the page
 *
 * The ecoindex, with all its environmental indicators, is updated at real time with these informations.
 *
 * @param browser The browser seam, injected.
 * @param consume Callback called as soon as a new analysis is available
 * @returns A set of functions used to handle the analysis, and stop it. Rejects if the browser
 * cannot start the analysis (for example `AgentError` NO_PERMISSION or TIMEOUT).
 */
export default async function analyseWebFlow(
  browser: Browser,
  params: WebFlowAnalysisParams,
  consume: (analysis: PageAnalysis[]) => void,
  options: WebFlowAnalysisOptions = {}
): Promise<WebFlowAnalysis> {
  const rules = options.rules ?? RULES;
  const domPollIntervalMs = options.domPollIntervalMs ?? 1000;
  const collectMinIntervalMs = options.collectMinIntervalMs ?? 5000;
  const ruleIds = collectableRuleIds(rules);

  let stopped = false;
  let finalPages: PageAnalysis[] | undefined;
  const closedList: ClosedPage[] = [];
  let page: CurrentPage = newPage(null, false);
  /** Incremented every time a page is closed; lets async work detect it is stale. */
  let generation = 0;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners: Closeable[] = [];

  browser.log("Analyse démarrée");

  if (params.refreshOnStart) {
    await browser.reloadInspectedPage({ purgeCache: true });
  }
  const [pageInfo, requests] = await Promise.all([
    browser.getPageInfo(),
    browser.getNetworkRequests(),
  ]);

  page = newPage({ ...pageInfo }, true);
  page.requests.push(...requests);

  /** One queue per analysis; absent when best practices are not checked. */
  const queue: EstimationQueue | undefined = params.checkBestPractices
    ? createEstimationQueue(options.imageEstimator ?? unavailableEstimator)
    : undefined;
  /** Incremented on every queue change; closed pages are rebuilt only when it moved. */
  let queueVersion = 0;
  let queueSubscription: Closeable | undefined;

  const evaluatePage = (
    snapshot: EvaluationSnapshot
  ): { bestPractices: BestPractice[]; imageGain?: PageImageGain } => {
    if (queue === undefined) return { bestPractices: [] };
    queue.request(planEstimations(rules, snapshot));
    const bestPractices = evaluateRules(rules, {
      ...snapshot,
      estimates: queue.lookup,
    });
    const combined = {
      requests: snapshot.requests,
      bestPractices,
      estimates: queue.lookup,
    };
    queue.request(planCombinedEstimations(combined));
    return { bestPractices, imageGain: computePageImageGain(combined) };
  };

  const withEvaluation = (
    analysis: PageAnalysis,
    snapshot: EvaluationSnapshot
  ): PageAnalysis => {
    const { bestPractices, imageGain } = evaluatePage(snapshot);
    const rebuilt: PageAnalysis = { ...analysis, bestPractices };
    if (imageGain !== undefined) rebuilt.imageGain = imageGain;
    else delete rebuilt.imageGain;
    return rebuilt;
  };

  const snapshotOfCurrent = (): EvaluationSnapshot => ({
    url: page.info?.url ?? "",
    requests: page.requests,
    pageData: page.pageData,
  });

  const buildCurrent = (): PageAnalysis =>
    withEvaluation(createPageAnalysis(page, []), snapshotOfCurrent());

  /** Closed pages, rebuilt (best practices and image gain only) when an estimate changed. */
  const closedPages = (): PageAnalysis[] => {
    for (const closed of closedList) {
      if (closed.builtAtVersion !== queueVersion) {
        closed.analysis = withEvaluation(closed.analysis, closed.snapshot);
        closed.builtAtVersion = queueVersion;
      }
    }
    return closedList.map((closed) => closed.analysis);
  };

  const sendAnalysis = () => {
    if (!stopped) consume([...closedPages(), buildCurrent()]);
  };

  if (queue !== undefined) {
    queueSubscription = queue.onChange(() => {
      queueVersion++;
      sendAnalysis();
    });
  }

  /** Collects the page data of the current page. Never rejects; stale results are dropped. */
  const collect = async () => {
    if (!params.checkBestPractices || ruleIds.length === 0 || page.info == null) {
      return;
    }
    const gen = generation;
    const domSize = page.info.domSize;
    page.lastCollectedAt = Date.now();
    page.lastCollectedDomSize = Math.max(domSize, page.maxDomSize);
    try {
      const data = await browser.collectPageData(ruleIds);
      if (gen === generation && !stopped) {
        page.pageData = { ...page.pageData, ...data };
      }
    } catch (e) {
      console.error("EcoInsights : best practices collection failed", e);
    }
  };

  /**
   * Page info for a navigation to `url`. The URL always comes from the event: during a navigation
   * `getPageInfo()` may reject or still describe the previous document. Its title and size are only
   * used when it describes `url`; otherwise the DOM poll fills them in on the next samples.
   */
  const fetchPageInfoFor = async (
    url: string
  ): Promise<{ info: PageInfos; known: boolean }> => {
    try {
      const fetched = await browser.getPageInfo();
      if (!isNotOnSamePage(fetched.url, url)) {
        return { info: { ...fetched, url }, known: true };
      }
    } catch (e) {
      console.error("EcoInsights : page info unavailable after navigation", e);
    }
    return { info: { title: "", domSize: 0, url }, known: false };
  };

  const closePage = (newInfo: PageInfos | null = null, seed = true) => {
    if (page.info == null) return;
    const snapshot = snapshotOfCurrent();
    closedList.push({
      snapshot,
      analysis: withEvaluation(createPageAnalysis(page, []), snapshot),
      builtAtVersion: queueVersion,
    });
    generation++;
    page = newPage(newInfo, seed);
    sendAnalysis();
  };

  const isSignificantChange = (domSize: number) => {
    const diff = Math.abs(domSize - page.lastCollectedDomSize);
    return (
      diff >= SIGNIFICANT_DOM_NODES ||
      diff >= page.lastCollectedDomSize * SIGNIFICANT_DOM_RATIO
    );
  };

  const onDomSample = async (sample: PageInfos) => {
    if (page.info == null || sample.url !== page.info.url) return;
    const lastSample = page.domProfile[page.domProfile.length - 1];
    const entry = { domSize: sample.domSize, date: new Date() };
    if (lastSample == null || lastSample.domSize !== sample.domSize) {
      page.domProfile.push(entry);
    } else {
      page.domProfile[page.domProfile.length - 1] = entry;
    }
    page.maxDomSize = Math.max(page.maxDomSize, sample.domSize);
    // The title isn't always up to date when the url changes: keep the latest one.
    page.info = { ...page.info, title: sample.title, domSize: sample.domSize };

    if (
      params.checkBestPractices &&
      Date.now() - page.lastCollectedAt >= collectMinIntervalMs &&
      isSignificantChange(sample.domSize)
    ) {
      await collect();
    }
    sendAnalysis();
  };

  const poll = async () => {
    try {
      await onDomSample(await browser.getPageInfo());
    } catch (e) {
      console.error("EcoInsights : DOM sampling failed", e);
    }
    if (!stopped) pollTimer = setTimeout(poll, domPollIntervalMs);
  };

  const closeBeforeNavigation = async () => {
    const gen = generation;
    await collect();
    // Another event may already have closed this page while we were collecting.
    if (!stopped && gen === generation) closePage();
  };

  const onNavigation = async (event: NavigationEvent) => {
    if (stopped) return;
    switch (event.kind) {
      case "url-changed": {
        const fetched = await fetchPageInfoFor(event.url);
        if (stopped) return;
        const newInfo = fetched.info;
        if (page.info == null) {
          page = newPage(newInfo, fetched.known);
          sendAnalysis();
        } else if (isNotOnSamePage(page.info.url, event.url)) {
          closePage(newInfo, fetched.known);
        }
        break;
      }
      case "link-clicked":
        if (params.triggerNewPageOnLinkClicked) await closeBeforeNavigation();
        break;
      case "form-submitted":
        if (params.triggerNewPageOnFormSubmitted) await closeBeforeNavigation();
        break;
    }
  };

  await collect();
  sendAnalysis();

  listeners.push(
    browser.onNetworkRequest((request) => {
      page.requests.push(request);
      sendAnalysis();
    })
  );
  listeners.push(
    browser.onNavigation((event) => {
      onNavigation(event).catch((e) =>
        console.error("EcoInsights : navigation handling failed", e)
      );
    })
  );
  pollTimer = setTimeout(poll, domPollIntervalMs);

  return {
    stopCurrentNavigation: () => closePage(),
    stopAnalysis: () => {
      if (finalPages === undefined) {
        stopped = true;
        if (pollTimer !== undefined) clearTimeout(pollTimer);
        listeners.forEach((listener) => listener.close());
        // Settles the pending estimations; `stopped` keeps the notification away from `consume`.
        queue?.stop();
        queueSubscription?.close();
        browser.log("Analyse terminée");
        finalPages =
          page.info == null
            ? closedPages()
            : [...closedPages(), buildCurrent()];
      }
      return [...finalPages];
    },
  };
}

function createPageAnalysis(
  page: CurrentPage,
  bestPractices: BestPractice[]
): PageAnalysis {
  const requestSizeInKb =
    page.requests.reduce((acc, r) => acc + r.responseSize, 0) / 1e3;

  const impact = computeEcoIndexAndEnvironmentalImpact(
    page.maxDomSize,
    page.requests.length,
    requestSizeInKb
  );

  return {
    title: page.info?.title ?? "(En attente)",
    url: page.info?.url ?? "(En attente)",
    navigatedAt: page.startedAt,
    requests: [...page.requests],
    domProfile: [...page.domProfile],
    maxDomSize: page.maxDomSize,
    requestSizeInKb: round(requestSizeInKb),
    impact,
    bestPractices,
  };
}
