import { useSearchParams, useNavigate, useParams } from "@solidjs/router";
import { Component, createEffect, createSignal, onCleanup } from "solid-js";
import { useEcoInsightsStore } from "../../store";
import { PageAnalysis } from "../../domain/models/page-analysis";
import analyseWebFlow, {
  WebFlowAnalysis,
  WebFlowAnalysisParams,
} from "../../domain/use-case/analyse-web-flow";
import AnalysisResult from "./AnalysisResult";
import Logo from "../shared/icons/Logo";

const PendingAnalysis: Component = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const store = useEcoInsightsStore();
  const analysis = store!.store.analysis.find((el) => el.id === params.id);

  const [pagesAnalysed, setAnalysis] = createSignal<PageAnalysis[]>([]);
  const [webFlowAnalysis, setWebFlowAnalysis] =
    createSignal<WebFlowAnalysis | null>(null);

  createEffect(() => {
    const params: WebFlowAnalysisParams = {
      refreshOnStart: searchParams["refreshOnStart"] === "true",
      triggerNewPageOnFormSubmitted:
        searchParams["triggerNewPageOnFormSubmitted"] === "true",
      triggerNewPageOnLinkClicked:
        searchParams["triggerNewPageOnLinkClicked"] === "true",
      checkBestPractices: searchParams["checkBestPractices"] === "true",
    };
    analyseWebFlow(params, (analysis) => {
      setAnalysis(analysis);
    }).then((callbacks) => setWebFlowAnalysis(callbacks));
  });

  onCleanup(() => {
    webFlowAnalysis()?.stopAnalysis();
  });

  if (analysis == null) {
    navigate("/");
  }

  return (
    <AnalysisResult
      header={
        <header class="flex flex-row items-center p-3">
          <Logo />
          <div class="flex flex-col mx-3">
            <h1>EcoInsights</h1>
            <p>Analyse en cours</p>
          </div>
          <div class="flex-1" />
          <button
            onClick={() => {
              const callbacks = webFlowAnalysis();
              if (callbacks != null) {
                callbacks.stopAnalysis();
              }
              if (store != null && analysis != null) {
                store!.saveAnalysis({
                  ...analysis,
                  pages: pagesAnalysed() ?? [],
                });
                navigate(`/analysis/${analysis.id}`);
              }
            }}
            type="button"
            class="btn-secondary"
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
  );
};

export default PendingAnalysis;
