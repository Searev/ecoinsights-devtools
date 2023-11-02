import { createEffect, onCleanup, onMount } from "solid-js";
import {
  Chart,
  Title,
  Tooltip,
  Legend,
  Colors,
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

export function DomProfileChart(props: { domProfile: DomProfile }) {
  let chartContext: HTMLCanvasElement;
  let chart: Chart;

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
      Colors,
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

  return <canvas ref={chartContext} height={200} />;
}
