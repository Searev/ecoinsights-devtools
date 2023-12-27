import { Show } from "solid-js";
import { getEcoIndexGrade } from "../../domain/use-case/ecoindex";

export default function EcoIndexBadge(props: {
  ecoindex: number;
  showLetter?: boolean;
}) {
  const grade = () => getEcoIndexGrade(props.ecoindex);

  const colors = () => {
    const color = grade()?.color;
    return `border-color: ${color}; color: ${color}`;
  };

  return (
    <Show when={grade() != null}>
      <span
        class={`px-2 py-1 border-2 rounded whitespace-nowrap`}
        style={colors()}
      >
        {props.showLetter
          ? `${props.ecoindex} - ${grade()?.grade ?? "/"}`
          : props.ecoindex}
      </span>
    </Show>
  );
}
