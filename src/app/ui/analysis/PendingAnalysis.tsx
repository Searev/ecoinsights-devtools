import { useSearchParams, useNavigate, useParams } from "@solidjs/router";
import {
  Component,
  Match,
  Switch,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { useBrowser } from "../../infra/browser-context";
import { useImageEstimator } from "../../infra/estimator-context";
import { useContentAnalyser } from "../../infra/content-analyser-context";
import { describeStartError } from "./start-error";
import Loader from "../shared/Loader/Loader";
import { useEcoInsightsStore } from "../../store";
import { PageAnalysis } from "../../domain/models/page-analysis";
import analyseWebFlow, {
  WebFlowAnalysis,
  WebFlowAnalysisParams,
} from "../../domain/use-case/analyse-web-flow";
import AnalysisResult from "./AnalysisResult";
import Logo from "../shared/icons/Logo";

type PendingState = "starting" | "recording" | "error";

const PendingAnalysis: Component = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const store = useEcoInsightsStore();
  const browser = useBrowser();
  const imageEstimator = useImageEstimator();
  const contentAnalyser = useContentAnalyser();
  const analysis = store!.store.analysis.find((el) => el.id === params.id);

  const [pagesAnalysed, setAnalysis] = createSignal<PageAnalysis[]>([]);
  const [webFlowAnalysis, setWebFlowAnalysis] =
    createSignal<WebFlowAnalysis | null>(null);
  const [state, setState] = createSignal<PendingState>("starting");
  const [errorMessage, setErrorMessage] = createSignal("");
  let disposed = false;

  const start = () => {
    const flowParams: WebFlowAnalysisParams = {
      refreshOnStart: searchParams["refreshOnStart"] === "true",
      triggerNewPageOnFormSubmitted:
        searchParams["triggerNewPageOnFormSubmitted"] === "true",
      triggerNewPageOnLinkClicked:
        searchParams["triggerNewPageOnLinkClicked"] === "true",
      checkBestPractices: searchParams["checkBestPractices"] === "true",
    };
    setState("starting");
    analyseWebFlow(
      browser,
      flowParams,
      (pages) => setAnalysis(pages),
      { imageEstimator, contentAnalyser }
    ).then(
      (flow) => {
        if (disposed) {
          flow.stopAnalysis();
          return;
        }
        setWebFlowAnalysis(flow);
        setState("recording");
      },
      (error) => {
        if (disposed) return;
        setErrorMessage(describeStartError(error));
        setState("error");
      },
    );
  };

  onMount(start);

  onCleanup(() => {
    disposed = true;
    webFlowAnalysis()?.stopAnalysis();
  });

  if (analysis == null) {
    navigate("/");
  }

  return (
    <Switch>
      <Match when={state() === "starting"}>
        <div class="flex flex-col items-center p-3 w-100" role="status">
          <Loader />
          <span class="mt-2">Démarrage de l'analyse en cours</span>
        </div>
      </Match>
      <Match when={state() === "error"}>
        <div class="m-3 p-3 bg-surface border border-2 rounded" role="alert">
          <h1>Impossible de démarrer l'analyse</h1>
          <p class="mt-2">{errorMessage()}</p>
          <div class="flex flex-row mt-2">
            <button type="button" class="btn-primary mr-2" onClick={start}>
              Réessayer
            </button>
            <button
              type="button"
              class="btn-secondary"
              onClick={() => navigate("/")}
            >
              Retour
            </button>
          </div>
        </div>
      </Match>
      <Match when={state() === "recording"}>
        <AnalysisResult
          header={
            <header class="flex flex-row items-center p-3">
              <Logo />
              <div class="flex flex-col mx-3">
                <h1>EcoInsights Devtools</h1>
                <p>Analyse en cours</p>
              </div>
              <div class="flex-1" />
              <button
                onClick={() => {
                  const callbacks = webFlowAnalysis();
                  // stopAnalysis() settles pending estimations and returns the final pages.
                  const finalPages =
                    callbacks != null
                      ? callbacks.stopAnalysis()
                      : pagesAnalysed() ?? [];
                  if (store != null && analysis != null) {
                    store!.saveAnalysis({
                      ...analysis,
                      pages: finalPages,
                    });
                    navigate(`/analysis/${analysis.id}`);
                  }
                }}
                type="button"
                class="btn-secondary"
                disabled={state() !== "recording"}
              >
                Stopper l'analyse
              </button>
            </header>
          }
          analysis={analysis}
          pagesAnalysed={pagesAnalysed()}
          onStopCurrentPage={() => {
            const callbacks = webFlowAnalysis();
            if (callbacks != null) {
              callbacks.stopCurrentNavigation();
            }
          }}
        />
      </Match>
    </Switch>
  );
};

export default PendingAnalysis;
