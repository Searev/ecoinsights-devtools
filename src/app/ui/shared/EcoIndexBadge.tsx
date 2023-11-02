import { getEcoIndexGrade } from "../../domain/use-case/ecoindex";

function getEcoIndexColor(ecoIndex: number): {
  background: string;
  text: string;
} {
  if (ecoIndex > 80)
    return { background: "bg-green-500", text: "text-green-950" };
  if (ecoIndex > 70)
    return { background: "bg-green-300", text: "text-green-900" };
  if (ecoIndex > 55)
    return { background: "bg-lime-300", text: "text-lime-900" };
  if (ecoIndex > 40)
    return { background: "bg-yellow-300", text: "text-yellow-900" };
  if (ecoIndex > 25)
    return { background: "bg-amber-500", text: "text-amber-900" };
  if (ecoIndex > 10) return { background: "bg-red-600", text: "text-red-950" };
  return { background: "bg-black", text: "text" };
}

export default function EcoIndexBadge(props: {
  ecoindex: number;
  showLetter?: boolean;
}) {
  const colors = () => {
    const { background, text } = getEcoIndexColor(props.ecoindex);
    return `${background} ${text}`;
  };
  const grade = () => getEcoIndexGrade(props.ecoindex);

  return (
    <span class={`px-2 py-1 rounded whitespace-nowrap ${colors()}`}>
      {props.showLetter ? `${props.ecoindex} - ${grade()}` : props.ecoindex}
    </span>
  );
}
