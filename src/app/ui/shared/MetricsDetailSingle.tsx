import { For } from "solid-js";
import { abbreviate } from "../../helpers/strings.helper";

export type PageMetric = { pageTitle: string; metric: number };

export default function MetricsDetailSingle(props: {
  metricName: string;
  median: number;
  pages: PageMetric[];
  class?: string;
}) {
  const percents = () => {
    const max = props.median * 2;
    return props.pages.map(({ pageTitle, metric }) => {
      const percent = (metric / max) * 100;
      return { pageTitle, metric, percent: percent > 100 ? 100 : percent };
    });
  };

  return (
    <div
      class={"flex flex-col p-3 bg-background rounded " + (props.class ?? "")}
    >
      <p class="pb-3">{props.metricName}</p>
      <div class="w-full h-[2px] bg-border mb-2">
        <div class="left-[50%] h-4 w-[1px] bg-border inline-block relative bottom-2" />
        <For each={percents()}>
          {({ pageTitle, metric, percent }) => (
            <div
              class="w-[8px] h-[8px] top-[-14px] bg-white inline-block relative has-tooltip"
              style={{
                left: `calc(${percent}% - 4px)`,
              }}
            >
              <span class="tooltip-content">{`${abbreviate(
                pageTitle,
                40
              )} : ${metric}`}</span>
            </div>
          )}
        </For>
      </div>
      <div class="w-full flex justify-between">
        <span class="font-thin">min</span>
        <span class="font-thin">médiane : {props.median}</span>
        <span class="font-thin">max</span>
      </div>
    </div>
  );
}
