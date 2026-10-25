import { A, useNavigate } from "@solidjs/router";
import { Component, For, createSignal } from "solid-js";
import { useEcoInsightsStore } from "./store";
import { useTheme } from "./ui/theme/ThemeProvider";
import { parseThemeMode } from "./ui/theme/theme-mode";
import { THEME_MODES, THEME_MODE_LABELS } from "./ui/theme/theme-types";

const Toolbar: Component = () => {
  const state = useEcoInsightsStore();
  const navigate = useNavigate();
  const analysis = () => state!.store.analysis;
  const [analysisId, setAnalysisId] = createSignal<string>();
  const theme = useTheme();

  return (
    <nav class="flex w-100 bg-surface text-strong">
      <A
        onClick={() => setAnalysisId("")}
        href="/"
        class="px-2 py-1 hover:bg-surfaceLight ease-out duration-200"
      >
        EcoInsights Devtools
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
      {/* US-030: theme selector, immediately left of "À propos". */}
      <label for="theme-mode" class="px-2 py-1">
        Thème
      </label>
      <select
        id="theme-mode"
        value={theme.mode()}
        onChange={(el) => theme.setMode(parseThemeMode(el.currentTarget.value))}
        class="px-2 bg-surface hover:bg-surfaceLight"
      >
        <For each={THEME_MODES}>
          {(mode) => <option value={mode}>{THEME_MODE_LABELS[mode]}</option>}
        </For>
      </select>
      <A
        href="/a-propos"
        class="px-2 py-1 hover:bg-surfaceLight ease-out duration-200"
      >
        À propos
      </A>
    </nav>
  );
};

export default Toolbar;
