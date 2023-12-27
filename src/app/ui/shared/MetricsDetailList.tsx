import { medians } from "ecoindex_reference";
import { PageAnalysis } from "../../domain/models/page-analysis";
import MetricsDetailSingle from "./MetricsDetailSingle";

export default function MetricsDetailList(props: {
  pagesAnalysed: PageAnalysis[];
}) {
  return (
    <div class="flex flex-col">
      <h2 class="font-bold mt-3 pb-1">Détails du score</h2>

      <MetricsDetailSingle
        metricName="Poids des pages (Mo)"
        median={medians.response_size}
        pages={props.pagesAnalysed.map((el) => ({
          pageTitle: el.title,
          metric: el.requestSizeInKb,
        }))}
        class="mb-4"
      />

      <MetricsDetailSingle
        metricName="Complexité (taille du DOM)"
        median={medians.dom_size}
        pages={props.pagesAnalysed.map((el) => ({
          pageTitle: el.title,
          metric: el.maxDomSize,
        }))}
        class="mb-4"
      />

      <MetricsDetailSingle
        metricName="Nombre de requêtes"
        median={medians.nb_request}
        pages={props.pagesAnalysed.map((el) => ({
          pageTitle: el.title,
          metric: el.requests.length,
        }))}
      />
    </div>
  );
}
