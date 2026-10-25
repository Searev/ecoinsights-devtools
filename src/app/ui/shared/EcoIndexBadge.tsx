import { JSX, Show } from "solid-js";
import { getEcoIndexGrade } from "../../domain/use-case/ecoindex";
import { ecoIndexBadgeStyle } from "./ecoindex-badge-style";

export default function EcoIndexBadge(props: {
  ecoindex: number;
  showLetter?: boolean;
}) {
  const grade = () => getEcoIndexGrade(props.ecoindex);

  const badgeStyle = () => {
    const color = grade()?.color;
    return color == null ? undefined : ecoIndexBadgeStyle(color);
  };

  return (
    <Show when={grade() != null}>
      <span
        class={`px-2 py-1 border-2 rounded whitespace-nowrap`}
        style={badgeStyle() as JSX.CSSProperties | undefined}
      >
        {props.showLetter
          ? `${props.ecoindex} - ${grade()?.grade ?? "/"}`
          : props.ecoindex}
      </span>
    </Show>
  );
}
