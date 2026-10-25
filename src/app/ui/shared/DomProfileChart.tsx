import { createEffect, onCleanup, onMount } from "solid-js";
import {
  Chart,
  Title,
  Tooltip,
  Legend,
  LineController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  TimeScale,
  Point,
} from "chart.js";
import { DomProfile } from "../../domain/models/dom-infos";
import "chartjs-adapter-date-fns";
import { fr } from "date-fns/locale";
import { useTheme } from "../theme/ThemeProvider";
import { applyChartColours, chartColours } from "../theme/chart-theme";

type ChartTarget = Parameters<typeof applyChartColours>[0];

export function DomProfileChart(props: { domProfile: DomProfile }) {
  let chartContext!: HTMLCanvasElement;
  let chart: Chart;
  const theme = useTheme();

  const paint = () => {
    // Chart's dataset types have no index signature; the helper only sets plain colour keys.
    applyChartColours(
      chart as unknown as ChartTarget,
      chartColours(theme.resolved()),
    );
    chart.update("none");
  };

  const getNormalizeDomProfile = (): Point[] => {
    return props.domProfile.map((dom) => ({
      x: dom.date.getTime(),
      y: dom.domSize,
    }));
  };

  onMount(() => {
    Chart.register(
      Title,
      Tooltip,
      Legend,
      LineController,
      CategoryScale,
      TimeScale,
      PointElement,
      LineElement,
      LinearScale
    );

    chart = new Chart(chartContext, {
      type: "line",
      data: {
        datasets: [
          {
            label: "Nombre d'éléments sur la page",
            data: getNormalizeDomProfile(),
          },
        ],
      },
      options: {
        parsing: false,
        scales: {
          x: {
            type: "time",
            time: {
              unit: "second",
            },
            adapters: {
              date: {
                locale: fr,
              },
            },
          },
        },
      },
    });
    paint();
  });

  onCleanup(() => {
    chart?.destroy();
  });

  createEffect(() => {
    if (chart != null) {
      const diff = getNormalizeDomProfile();
      chart.data.datasets[0].data = [...diff];
      chart.update();
    }
  });

  createEffect(() => {
    theme.resolved();
    if (chart != null) {
      paint();
    }
  });

  return <canvas ref={chartContext} height={200} />;
}
