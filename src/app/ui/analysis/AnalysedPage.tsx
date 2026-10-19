import { createSignal, Show, For } from "solid-js";
import { PageAnalysis } from "../../domain/models/page-analysis";
import EcoIndexBadge from "../shared/EcoIndexBadge";
import UrlAbbr from "../shared/UrlAbbr";
import ExpandLess from "../shared/icons/ExpandLess";
import ExpandMore from "../shared/icons/ExpandMore";
import EnvironnementalImpact from "./EnvironnementalImpact";
import Clear from "../shared/icons/Clear";
import { DomProfileChart } from "../shared/DomProfileChart";
import { BestPractices } from "./BestPractices";
import {
  describePageImageGain,
  pageTransferBytes,
} from "./image-gain-view";

export default function AnalysedPage(props: {
  analysis: PageAnalysis;
  onClose: () => void;
}) {
  const [shouldShowRequestDetail, showRequestDetail] =
    createSignal<boolean>(false);
  return (
    <div class="flex flex-col flex-1 overflow-y-auto ">
      <div class="flex flex-row">
        <button
          class="btn-icon-tertiary py-2 px-3"
          onClick={() => props.onClose()}
        >
          <Clear />
        </button>
        <div class="p-2">
          <span class="font-semibol">Page&nbsp;:&nbsp;</span>
          <span>
            {props.analysis.title.trim().length > 0
              ? props.analysis.title
              : props.analysis.url}
          </span>
        </div>
        <div class="flex-1" />
        <div class="p-2">
          <span class="font-semibold">EcoIndex&nbsp;:&nbsp;</span>
          <EcoIndexBadge ecoindex={props.analysis.impact.ecoindex} showLetter />
        </div>
      </div>
      <Show when={props.analysis.title.trim().length > 0}>
        <p class="w-full px-3">{props.analysis.url}</p>
      </Show>

      <div class="p-3">
        <EnvironnementalImpact
          greenhouseGasEmissions={props.analysis.impact.greenhouseGasEmissions}
          blueWaterConsumption={props.analysis.impact.blueWaterConsumption}
        />
        <p
          class="mt-2"
          role={props.analysis.imageGain?.pendingCount ? "status" : undefined}
        >
          <span class="font-semibold">Gain estimé (images)&nbsp;:&nbsp;</span>
          <span>
            {describePageImageGain(
              props.analysis.imageGain,
              pageTransferBytes(props.analysis)
            )}
          </span>
        </p>
      </div>
      <Show when={(props.analysis?.bestPractices?.length ?? 0) > 0}>
        <div class="px-3 pb-3 bg-surface border-t-2 border-border">
          <BestPractices pagesAnalysed={[props.analysis]} />
        </div>
      </Show>

      <div class="mt-2">
        <button
          class="hover:bg-tableOdd w-full flex flex-row items-center px-3 py-2"
          onClick={() => showRequestDetail(!shouldShowRequestDetail())}
        >
          <span class="font-bold text-white">
            {props.analysis.requests.length} requête(s)
          </span>
          <span class="flex-1" />
          <Show when={shouldShowRequestDetail()} fallback={<ExpandMore />}>
            <ExpandLess />
          </Show>
        </button>
        <Show when={shouldShowRequestDetail()}>
          <div class="mx-3">
            <table class="table-fixed w-full">
              <thead class="bg-background border border-2 border-border">
                <tr>
                  <th class="p-1 text-left border border-2 border-border">
                    Fichier
                  </th>
                  <th class="p-1 text-left border border-2 border-border">
                    Hôte
                  </th>
                  <th class="p-1 text-left border border-2 border-border">
                    Statut
                  </th>
                  <th class="p-1 text-left border border-2 border-border">
                    Taille
                  </th>
                  <th class="p-1 text-left border border-2 border-border">
                    Transfert
                  </th>
                  <th class="p-1 text-left border border-2 border-border">
                    Type
                  </th>
                </tr>
              </thead>
              <tbody>
                <For each={props.analysis.requests}>
                  {(request) => (
                    <tr>
                      <td class="p-1 border border-2 border-border text-overflow-ellipsis">
                        <UrlAbbr request={request} />
                      </td>
                      <td class="p-1 border border-2 border-border text-overflow-ellipsis">
                        {request.url.hostname}
                      </td>
                      <td class="p-1 border border-2 border-border text-overflow-ellipsis">
                        {request.code}
                      </td>
                      <td class="p-1 border border-2 border-border text-overflow-ellipsis">
                        {Math.round(request.responseSize / 10) / 100}
                        &nbsp;ko
                      </td>
                      <td class="p-1 border border-2 border-border text-overflow-ellipsis">
                        {Math.round(request.transferSize / 10) / 100}
                        &nbsp;ko
                      </td>
                      <td class="p-1 border border-2 border-border text-overflow-ellipsis">
                        {request.type}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>

      <div class="mt-2 flex flex-col px-3">
        <h2 class="font-bold">Evolution de la taille du DOM</h2>
        <DomProfileChart domProfile={props.analysis.domProfile} />
      </div>
    </div>
  );
}
