import { Show } from "solid-js";
import { useBrowser } from "../../infra/browser-context";
import Cloud from "../shared/icons/Cloud";
import WaterDrop from "../shared/icons/WaterDrop";
import { round } from "../../helpers/math.helpers";

export default function EnvironnementalImpact(props: {
  greenhouseGasEmissions: number;
  blueWaterConsumption: number;
  displayEquivalences?: boolean;
}) {
  const browser = useBrowser();
  const kmEquivalents = () => round(props.greenhouseGasEmissions * 3);
  const minutesOfShowerEquivalent = () => {
    const nbMinutes = props.blueWaterConsumption / 6;
    const minutes = Math.floor(nbMinutes);
    const seconds = Math.floor((nbMinutes - minutes) * 60);
    return minutes > 0
      ? `${minutes} minutes et ${seconds} secondes`
      : `${seconds} secondes`;
  };

  return (
    <div class="flex flex-col w-full">
      <div class="flex flex-row w-full justify-between align-center mt-3 pb-1">
        <h2 class="font-bold">Impact environnemental</h2>
        <button
          class="underline"
          onClick={() =>
            browser.openUrlInNewTab(
              "https://www.ecoindex.fr/comment-ca-marche/#lempreinte-environnementale"
            )
          }
        >
          Comment est réalisée cette estimation ?
        </button>
      </div>

      <div class="flex flex-row w-full align-center mt-2">
        <div class="flex flex-col flex-1 bg-background mr-3 p-3 rounded">
          <div class="flex flex-row items-center">
            <Cloud />
            <span class="font-bold ml-2">
              {props.greenhouseGasEmissions}&nbsp;g CO2e
            </span>
          </div>
          <span>Émissions de gaz à effet de serre</span>
        </div>
        <div class="flex flex-col flex-1 bg-background ml-3 p-3 rounded">
          <div class="flex flex-row items-center">
            <WaterDrop />
            <span class="font-bold ml-2">{props.blueWaterConsumption}&nbsp;cL</span>
          </div>
          <span>Consommation d'eau bleue</span>
        </div>
      </div>

      <Show when={props.displayEquivalences}>
        <div class="mt-3 p-3 bg-background rounded">
          <h2 class="font-bold">Mise en perspective</h2>
          <p>
            Pour vous donner une idée, 1 kg CO2e équivaut à un trajet d’environ
            3 km en voiture thermique. Une douche consomme en moyenne 6 litres d’eau à la
            minute.
            <br />
            <br />
            Si votre parcours émet&nbsp;
            <strong>{props.greenhouseGasEmissions}&nbsp;g CO2e</strong> et
            consomme&nbsp;
            <strong>{props.blueWaterConsumption}&nbsp;cL d’eau</strong>, cela signifie
            que pour 1&nbsp;000 visiteurs mensuels, l’empreinte est de&nbsp;
            {props.greenhouseGasEmissions}&nbsp;kg de CO2e et&nbsp;
            {props.blueWaterConsumption} litres d’eau par mois – soit un trajet
            de {kmEquivalents()}&nbsp;km en voiture et une douche de&nbsp;
            {minutesOfShowerEquivalent()}.
          </p>
        </div>
      </Show>
    </div>
  );
}
