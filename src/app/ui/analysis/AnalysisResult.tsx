import { Show, For, createSignal, JSX } from "solid-js";
import { Analysis } from "../../domain/models/analysis";
import { PageAnalysis } from "../../domain/models/page-analysis";
import EcoIndexBadge from "../shared/EcoIndexBadge";
import AnalysedPage from "./AnalysedPage";
import { round } from "../../helpers/math.helpers";
import Add from "../shared/icons/Add";

export default function AnalysisResult(props: {
  header: JSX.Element;
  additionnalContext?: JSX.Element;
  analysis?: Analysis;
  pagesAnalysed: PageAnalysis[];
  onStopCurrentPage: (() => void) | null;
}) {
  const [isResizing, setIsResizing] = createSignal<boolean>(false);
  const [bottomSheetHeight, setBottomSheetHeight] = createSignal<number>(150);
  const body = document.querySelector("body")!;

  const [selectedRow, selectRow] = createSignal<number | null>(null);

  const emissionsGESTotales = () =>
    round(
      props.pagesAnalysed.reduce(
        (acc, currentAnalysis) => acc + currentAnalysis.impact.emissionsGES,
        0
      )
    );
  const consommationEauBleue = () =>
    round(
      props.pagesAnalysed.reduce(
        (acc, currentAnalysis) =>
          acc + currentAnalysis.impact.consommationEauBleue,
        0
      )
    );
  const ecoIndexMoyen = () =>
    round(
      props.pagesAnalysed.reduce(
        (acc, currentAnalysis) => acc + currentAnalysis.impact.ecoindex,
        0
      ) / (props.pagesAnalysed.length || 1)
    );

  return (
    <section
      class={
        "h-full flex flex-col overflow-y-auto" +
        (isResizing() ? " select-none" : "")
      }
      onMouseUp={() => {
        setIsResizing(false);
      }}
      onMouseMove={(e) => {
        if (isResizing()) {
          setBottomSheetHeight(body.scrollHeight - e.clientY);
        }
      }}
    >
      {props.header}

      <div class="flex-1 overflow-y-auto">
        <Show when={props.analysis != null}>
          <div class="p-3 flex flex-col bg-surface">
            <div class="flex flex-row">
              <span class="flex-1 font-semibold">Service analysé</span>
              <span class="flex-1">{props.analysis!.service.name}</span>
            </div>
            <div class="flex flex-row">
              <span class="flex-1 font-semibold">Description</span>
              <span class="flex-1">{props.analysis!.service.description}</span>
            </div>
            <div class="flex flex-row">
              <span class="flex-1 font-semibold">Adresse</span>
              <span class="flex-1">{props.analysis!.service.url}</span>
            </div>
          </div>

          <Show when={props.additionnalContext != null}>
            {props?.additionnalContext}
          </Show>
        </Show>

        <Show
          when={props.pagesAnalysed.length > 0}
          fallback={<p class="p-3">Chargement en cours...</p>}
        >
          <table class="w-full table-auto">
            <thead class="bg-tableEven border-b-2 border-border">
              <tr>
                <th class="p-1 text-left">Page</th>
                <th class="p-1 text-left">Requêtes</th>
                <th class="p-1 text-left">Taille de la page</th>
                <th class="p-1 text-left">Taille du DOM Max</th>
                <th class="p-1 text-left">EcoIndex</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.pagesAnalysed}>
                {(pageAnalysed, index) => (
                  <tr
                    onClick={() =>
                      selectedRow() === index()
                        ? selectRow(null)
                        : selectRow(index)
                    }
                    class={
                      selectedRow() === index()
                        ? "bg-primary-500 hover:bg-primary-600 cursor-pointer"
                        : "hover:bg-surface cursor-pointer"
                    }
                  >
                    <td class="p-1">
                      {pageAnalysed.title.trim().length > 0
                        ? pageAnalysed.title
                        : pageAnalysed.url}
                    </td>
                    <td class="p-1">{pageAnalysed.requests.length}</td>
                    <td class="p-1">{pageAnalysed.requestSizeInKb} ko</td>
                    <td class="p-1">{pageAnalysed.maxDomSize ?? 0}</td>
                    <td>
                      <div class="inline p-1">
                        <EcoIndexBadge
                          ecoindex={pageAnalysed.impact.ecoindex ?? 0}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </For>
              <Show when={props.onStopCurrentPage != null}>
                <tr>
                  <td colspan="5">
                    <button
                      onClick={(event) => {
                        event.stopImmediatePropagation();
                        props.onStopCurrentPage!();
                      }}
                      class="btn-tertiary flex items-center"
                    >
                      <Add />
                      <span class="ml-2">Nouvelle page</span>
                    </button>
                  </td>
                </tr>
              </Show>
            </tbody>
          </table>

          <Show when={selectedRow() != null}>
            <div
              class="fixed bottom-0 left-0 right-0 pb-3 max-h-[50vh] bg-background flex flex-col"
              style={{ "min-height": `${bottomSheetHeight()}px` }}
            >
              <div
                class={
                  "w-full border-t-2 hover:border-t-4 active:border-t-4 active:border-primary-500 border-border cursor-row-resize"
                }
                onMouseDown={() => setIsResizing(true)}
              />
              <AnalysedPage
                analysis={props.pagesAnalysed[selectedRow() ?? 0]}
                onClose={() => selectRow(null)}
              />
            </div>
          </Show>
        </Show>
      </div>

      <Show when={props.pagesAnalysed.length > 0}>
        <div class="flex flew-row items-center w-full border-t-2 border-border py-2 px-3">
          <span>Impact total&nbsp;:&nbsp;</span>
          <span>{emissionsGESTotales()}g CO2e</span>
          <span class="mx-1 h-full border-r border-border" />
          <span>{consommationEauBleue()}cL d'eau bleue</span>
          <span class="flex-1" />
          <span>
            EcoIndex moyen <EcoIndexBadge ecoindex={ecoIndexMoyen()} />
          </span>
        </div>
      </Show>
    </section>
  );
}
