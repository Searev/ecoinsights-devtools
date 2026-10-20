import { For } from "solid-js";
import { InfoRow } from "./info-rows";

/** The information list of a preview (epic §4). Wiring only: the rows come from pure helpers. */
export function PreviewInfoList(props: { rows: InfoRow[] }) {
  return (
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
      <For each={props.rows}>
        {(row) => (
          <>
            <dt class="text-onsurface">{row.label}</dt>
            <dd class="break-all">{row.value}</dd>
          </>
        )}
      </For>
    </dl>
  );
}
