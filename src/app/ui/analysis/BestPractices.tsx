import { For, Show, createSignal } from "solid-js";
import {
  BestPractice,
  BestPracticeCompliance,
  BestPracticeId,
} from "../../domain/models/best-practice";
import { PageAnalysis } from "../../domain/models/page-analysis";
import ExpandMore from "../shared/icons/ExpandMore";

function getBackgroundForComplianceLevel(compliance: BestPracticeCompliance) {
  switch (compliance) {
    case "A":
      return "bg-green-500";
    case "B":
      return "bg-yellow-500";
    default:
      return "bg-red-500";
  }
}

type DisplayBestPractice = {
  id: BestPracticeId;
  name: string;
  detail: string;
  pages: string[];
  compliance: BestPracticeCompliance;
  expanded: boolean;
};

export function BestPractices(props: { pagesAnalysed: PageAnalysis[] }) {
  const [onlyShowIgnoredPractices, setOnlyShowIgnoredPractices] =
    createSignal(true);

  const [expandedBestPractices, setExpandedBestPractices] = createSignal<
    BestPracticeId[]
  >([]);

  const bestPracticesToDisplay = (): DisplayBestPractice[] => {
    const bestPracticesMap = new Map<
      BestPracticeId,
      [BestPractice, PageAnalysis[]]
    >();
    props.pagesAnalysed.forEach(page => {
      page.bestPractices?.forEach(bestPractice => {
        const currentValue = bestPracticesMap.get(bestPractice.id);

        if (currentValue == null) {
          bestPracticesMap.set(bestPractice.id, [bestPractice, [page]]);
        } else {
          if (currentValue[0].compliance < bestPractice.compliance) {
            currentValue[0] = bestPractice;
          }

          currentValue[1] = [...currentValue[1], page];
        }
      });
    });

    const expandedIds = expandedBestPractices();

    const bestPractices: DisplayBestPractice[] = Array.from(
      bestPracticesMap.values()
    ).map(([bestPractice, pages]) => ({
      id: bestPractice.id,
      name: bestPractice.name,
      detail: bestPractice.detail,
      pages: pages.map(el => el.title),
      compliance: bestPractice.compliance,
      expanded: expandedIds.includes(bestPractice.id),
    }));

    return onlyShowIgnoredPractices()
      ? bestPractices.filter(el => el.compliance !== "A")
      : bestPractices;
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

      <div>
        <For each={bestPracticesToDisplay()}>
          {el => (
            <details
              class="pb-1 border-b-2 border-border mb-2"
              open={el.expanded}
            >
              <summary
                class="flex flex-row items-center"
                onclick={() => {
                  const isExpanded = el.expanded;
                  if (isExpanded) {
                    setExpandedBestPractices(
                      expandedBestPractices().filter(id => id != el.id)
                    );
                  } else {
                    setExpandedBestPractices([
                      el.id,
                      ...expandedBestPractices(),
                    ]);
                  }
                }}
              >
                <div
                  class={
                    "w-3 h-3 rounded mr-1 " +
                    getBackgroundForComplianceLevel(el.compliance)
                  }
                />
                <span>{el.name}</span>
                <div class="flex-1" />
                <div>
                  <ExpandMore />
                </div>
              </summary>
              <div>
                <p class="mb-2 whitespace-pre-line">{el.detail}</p>
                <Show when={el.compliance !== "A"}>
                  <p class="font-medium">Pages concernées :</p>
                  <ul class="list-disc">
                    <For each={el.pages}>
                      {page => <li class="ml-4">{page}</li>}
                    </For>
                  </ul>
                </Show>
              </div>
            </details>
          )}
        </For>
      </div>
    </div>
  );
}
