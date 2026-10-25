import { For, Match, Show, Switch, createSignal } from "solid-js";
import {
  BestPracticeCompliance,
  BestPracticeId,
} from "../../domain/models/best-practice";
import { PageAnalysis } from "../../domain/models/page-analysis";
import { useBrowser } from "../../infra/browser-context";
import { referenceViewFor } from "./best-practice-reference";
import ExpandMore from "../shared/icons/ExpandMore";
import ExpandLess from "../shared/icons/ExpandLess";
import { ImageName } from "./ImageName";
import {
  AggregatedBestPractice,
  CATEGORY_LABELS,
  aggregateBestPractices,
  describeProgress,
  groupByCategory,
} from "./best-practices-view";

function ComplianceBadge(props: { compliance?: BestPracticeCompliance }) {
  const style = () => {
    switch (props.compliance) {
      case "A":
        return "bg-green-500";
      case "B":
        return "bg-yellow-500";
      case "C":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };
  return (
    <span class="flex flex-row items-center mr-2">
      <span class={"w-3 h-3 rounded mr-1 " + style()} aria-hidden="true" />
      <Show when={props.compliance === undefined}>
        <span class="text-xs rounded px-1 bg-gray-500 text-white">
          Non évaluée
        </span>
      </Show>
    </span>
  );
}

export function BestPractices(props: { pagesAnalysed: PageAnalysis[] }) {
  const browser = useBrowser();
  const [onlyShowIgnoredPractices, setOnlyShowIgnoredPractices] =
    createSignal(true);

  const [expandedBestPractices, setExpandedBestPractices] = createSignal<
    BestPracticeId[]
  >([]);

  const isExpanded = (id: BestPracticeId) =>
    expandedBestPractices().includes(id);

  const toggle = (id: BestPracticeId) =>
    setExpandedBestPractices(
      isExpanded(id)
        ? expandedBestPractices().filter((el) => el !== id)
        : [id, ...expandedBestPractices()]
    );

  const groups = () => {
    const all = aggregateBestPractices(props.pagesAnalysed);
    return groupByCategory(
      onlyShowIgnoredPractices() ? all.filter(
            (el) => el.compliance !== "A" || el.progress !== undefined
          ) : all
    );
  };

  const Item = (itemProps: { item: AggregatedBestPractice }) => {
    const reference = () => referenceViewFor(itemProps.item.id);
    const panelId = () => `best-practice-${itemProps.item.id}`;
    return (
      <li class="pb-1 border-b-2 border-border mb-2">
        <button
          type="button"
          class="flex flex-row items-center w-full text-left"
          aria-expanded={isExpanded(itemProps.item.id)}
          aria-controls={panelId()}
          onClick={() => toggle(itemProps.item.id)}
        >
          <Show
            when={itemProps.item.progress}
            fallback={<ComplianceBadge compliance={itemProps.item.compliance} />}
          >
            {(progress) => (
              <span class="flex flex-row items-center mr-2">
                <span
                  class="w-3 h-3 rounded mr-1 bg-gray-500"
                  aria-hidden="true"
                />
                <span role="status" class="text-xs">
                  {describeProgress(progress())}
                </span>
              </span>
            )}
          </Show>
          <Show when={reference().label}>
            {(label) => (
              <span class="text-xs rounded px-1 mr-2 border border-border whitespace-nowrap">
                {label()}
              </span>
            )}
          </Show>
          <span>{itemProps.item.name}</span>
          <div class="flex-1" />
          <Show when={itemProps.item.indicator}>
            {(indicator) => (
              <span class="text-xs ml-2 text-right">{indicator()}</span>
            )}
          </Show>
          <span aria-hidden="true">
            <Show when={isExpanded(itemProps.item.id)} fallback={<ExpandMore />}>
              <ExpandLess />
            </Show>
          </span>
        </button>
        <Show when={isExpanded(itemProps.item.id)}>
          <div id={panelId()}>
            <Show when={reference().description}>
              {(description) => (
                <p class="my-2">
                  <For each={description()}>
                    {(line) => (
                      <span class="block">
                        <For each={line}>
                          {(segment) => (
                            <Show when={segment.bold} fallback={segment.text}>
                              <strong>{segment.text}</strong>
                            </Show>
                          )}
                        </For>
                      </span>
                    )}
                  </For>
                </p>
              )}
            </Show>
            <Show when={reference().link}>
              {(link) => (
                <button
                  type="button"
                  class="underline mb-1 block text-left"
                  onClick={() => browser.openUrlInNewTab(link().url)}
                >
                  {link().label}
                </button>
              )}
            </Show>
            <Show when={reference().source}>
              {(source) => <p class="text-xs mb-2">{source()}</p>}
            </Show>
            <p class="mb-2 whitespace-pre-line">{itemProps.item.detail}</p>
            <Show when={itemProps.item.error}>
              <p class="mb-2 italic">Erreur : {itemProps.item.error}</p>
            </Show>
            <Show when={itemProps.item.lines.length > 0}>
              <p class="font-medium">Éléments concernés :</p>
              <ul class="list-disc mb-2">
                <For each={itemProps.item.lines}>
                  {(line) => (
                    <Switch fallback={<li class="ml-4 break-all">{line.text}</li>}>
                      <Match when={line.kind === "image" ? line : undefined}>
                        {(image) => (
                          <li class="ml-4">
                            <ImageName
                              name={image().name}
                              comparison={image().comparison}
                              ruleId={image().ruleId}
                              url={image().url}
                            />
                            <span class="break-all">{" : "}{image().rest}</span>
                          </li>
                        )}
                      </Match>
                      <Match when={line.kind === "file" ? line : undefined}>
                        {(file) => (
                          <li class="ml-4">
                            {file().prefix}
                            <ImageName
                              name={file().name}
                              preview={file().preview}
                              ruleId={file().ruleId}
                              url={file().url}
                            />
                            <span class="break-all">{file().rest}</span>
                          </li>
                        )}
                      </Match>
                    </Switch>
                  )}
                </For>
              </ul>
            </Show>
            <Show when={itemProps.item.compliance !== "A"}>
              <p class="font-medium">Pages concernées :</p>
              <ul class="list-disc">
                <For each={itemProps.item.pages}>
                  {(page, i) => {
                    const ind = () => itemProps.item.pageIndicators[i()];
                    return (
                      <li class="ml-4">
                        {`${page}${ind() ? ` — ${ind()}` : ""}`}
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>
          </div>
        </Show>
      </li>
    );
  };

  return (
    <div class="flex flex-col">
      <div class="flex justify-between mt-3 pb-1">
        <h2 class="font-bold">Bonnes pratiques</h2>
        <div class="mb-1">
          <input
            type="checkbox"
            id="onlyShowIgnoredPractices"
            name="onlyShowIgnoredPractices"
            checked={onlyShowIgnoredPractices()}
            onChange={() =>
              setOnlyShowIgnoredPractices(!onlyShowIgnoredPractices())
            }
          />
          <label for="onlyShowIgnoredPractices" class="ml-2">
            N'afficher que les pratiques non suivies
          </label>
        </div>
      </div>

      <For each={groups()}>
        {(group) => (
          <section class="mb-3">
            <h3 class="font-semibold mb-1">{CATEGORY_LABELS[group.category]}</h3>
            <ul>
              <For each={group.items}>{(item) => <Item item={item} />}</For>
            </ul>
          </section>
        )}
      </For>
    </div>
  );
}
