import { useNavigate, useParams } from "@solidjs/router";
import { Component, Show, createSignal } from "solid-js";
import { useEcoInsightsStore } from "../../store";
import Logo from "../shared/icons/Logo";
import AnalysisResult from "./AnalysisResult";
import EnvironnementalImpact from "./EnvironnementalImpact";
import { round } from "../../helpers/math.helpers";
import { downloadAsCsv } from "../../domain/use-case/export-csv";
import ConfirmDialog from "../shared/ConfimDialog";
import MetricsDetailList from "../shared/MetricsDetailList";
import { BestPractices } from "./BestPractices";

const SavedAnalysis: Component = () => {
  const navigate = useNavigate();
  const params = useParams();
  const store = useEcoInsightsStore();
  const [showRemoveDialog, setShowRemoveDialog] = createSignal(false);
  const analysis = () => {
    const result = store!.store.analysis.find((el) => el.id === params.id);

    if (result == null) {
      navigate("/");
    }

    return result;
  };

  return (
    <>
      <AnalysisResult
        header={
          <header class="flex flex-row items-center p-3">
            <Logo />
            <div class="flex flex-col mx-3">
              <h1>EcoInsights</h1>
              <p>Analyse terminée</p>
            </div>
            <div class="flex-1" />
            <div class="flex flex-col md:flex-row">
              <button
                onClick={() => {
                  const optAnalysis = analysis();
                  if (optAnalysis != null) {
                    downloadAsCsv(optAnalysis);
                  }
                }}
                type="button"
                class="btn-secondary mb-2 md:mb-0 md:mr-2"
              >
                Exporter au format .csv
              </button>
              <button
                onClick={() => setShowRemoveDialog(true)}
                type="button"
                class="btn-secondary-danger"
              >
                Supprimer l'analyse
              </button>
            </div>
          </header>
        }
        additionnalContext={
          <div>
            <div class="px-3 pb-3 bg-surface border-t-2 border-border">
              <EnvironnementalImpact
                greenhouseGasEmissions={round(
                  analysis()?.pages.reduce(
                    (acc, el) => acc + el.impact.greenhouseGasEmissions,
                    0
                  ) ?? 0
                )}
                blueWaterConsumption={round(
                  analysis()?.pages.reduce(
                    (acc, el) => acc + el.impact.blueWaterConsumption,
                    0
                  ) ?? 0
                )}
                displayEquivalences
              />
            </div>
            <div class="px-3 pb-3 bg-surface border-t-2 border-border">
              <MetricsDetailList pagesAnalysed={analysis()?.pages ?? []} />
            </div>
            <Show
              when={analysis()?.pages?.some(
                (el) => (el.bestPractices?.length ?? 0) > 0
              )}
            >
              <div class="px-3 pb-3 bg-surface border-t-2 border-border">
                <BestPractices pagesAnalysed={analysis()?.pages ?? []} />
              </div>
            </Show>
          </div>
        }
        analysis={analysis()}
        pagesAnalysed={analysis()?.pages ?? []}
        onStopCurrentPage={null}
        hideTotalImpact
      />

      <ConfirmDialog
        title="Suppression d'une analyse"
        message="Êtes-vous sûre de vouloir supprimer cette analyse ? Cette action est irréversible."
        action="Supprimer cette analyse"
        isActionDestructive={true}
        onClose={() => {
          setShowRemoveDialog(false);
        }}
        onConfirm={() => {
          setShowRemoveDialog(false);
          store?.removeAnalysis(params.id);
          navigate("/");
        }}
        opened={showRemoveDialog()}
      />
    </>
  );
};

export default SavedAnalysis;
