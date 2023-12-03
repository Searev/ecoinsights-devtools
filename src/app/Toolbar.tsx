import { A, useNavigate } from "@solidjs/router";
import { Component, For, createSignal } from "solid-js";
import { useEcometricsStore } from "./store";

const Toolbar: Component = () => {
  const state = useEcometricsStore();
  const navigate = useNavigate();
  const analysis = () => state!.store.analysis;
  const [analysisId, setAnalysisId] = createSignal<string>();

  return (
    <nav class="flex w-100 bg-surface text-white">
      <A
        onClick={() => setAnalysisId("")}
        href="/"
        class="px-2 py-1 hover:bg-surfaceLight ease-out duration-200"
      >
        EcoMetrics
      </A>
      <select
        onChange={(el) => {
          const analysisId = el.target.value;
          if (analysisId?.trim()?.length > 0) {
            setAnalysisId(analysisId);
            navigate(`/analysis/${analysisId}`);
          }
        }}
        disabled={analysis().length === 0}
        value={analysisId()}
        class="px-2 bg-surface hover:bg-surfaceLight max-w-[50%] text-overflow-ellipsis"
      >
        <option value="" disabled>
          Sélectionnez une analyse
        </option>
        <For each={analysis()}>
          {(el) => (
            <option value={el.id}>
              {el.service.name}&nbsp;-&nbsp;
              {el.date.toLocaleDateString("fr-FR")}
            </option>
          )}
        </For>
      </select>
      <div class="flex-1" />
      <A
        href="/a-propos"
        class="px-2 py-1 hover:bg-surfaceLight ease-out duration-200"
      >
        A propos
      </A>
    </nav>
  );
};

export default Toolbar;
