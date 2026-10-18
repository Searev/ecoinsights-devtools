import { For, Show, createSignal } from "solid-js";
import {
  BestPracticeCompliance,
  BestPracticeId,
} from "../../domain/models/best-practice";
import { PageAnalysis } from "../../domain/models/page-analysis";
import ExpandMore from "../shared/icons/ExpandMore";
import ExpandLess from "../shared/icons/ExpandLess";
import {
  AggregatedBestPractice,
  CATEGORY_LABELS,
  aggregateBestPractices,
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
      onlyShowIgnoredPractices() ? all.filter((el) => el.compliance !== "A") : all
    );
  };

  const Item = (itemProps: { item: AggregatedBestPractice }) => {
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
          <ComplianceBadge compliance={itemProps.item.compliance} />
          <span>{itemProps.item.name}</span>
          <div class="flex-1" />
          <span aria-hidden="true">
            <Show when={isExpanded(itemProps.item.id)} fallback={<ExpandMore />}>
              <ExpandLess />
            </Show>
          </span>
        </button>
        <Show when={isExpanded(itemProps.item.id)}>
          <div id={panelId()}>
            <p class="mb-2 whitespace-pre-line">{itemProps.item.detail}</p>
            <Show when={itemProps.item.error}>
              <p class="mb-2 italic">Erreur : {itemProps.item.error}</p>
            </Show>
            <Show when={itemProps.item.offenders.length > 0}>
              <p class="font-medium">Éléments concernés :</p>
              <ul class="list-disc mb-2">
                <For each={itemProps.item.offenders}>
                  {(offender) => (
                    <li class="ml-4 break-all">{offender}</li>
                  )}
                </For>
              </ul>
            </Show>
            <Show when={itemProps.item.compliance !== "A"}>
              <p class="font-medium">Pages concernées :</p>
              <ul class="list-disc">
                <For each={itemProps.item.pages}>
                  {(page) => <li class="ml-4">{page}</li>}
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
