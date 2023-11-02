import { Show } from "solid-js";
import { getBrowser } from "../../infra/browser-factory";
import Cloud from "../shared/icons/Cloud";
import WaterDrop from "../shared/icons/WaterDrop";
import { round } from "../../helpers/math.helpers";

export default function EnvironnementalImpact(props: {
  emissionsGES: number;
  consommationEauBleue: number;
  afficherEquivalences?: boolean;
}) {
  const kmEquivalents = () => round(props.emissionsGES * 3);
  const minDoucheEquivalent = () => {
    const nbMinutes = props.consommationEauBleue / 6;
    const minutes = Math.floor(nbMinutes);
    const secondes = Math.floor((nbMinutes - minutes) * 60);
    return minutes > 0
      ? `${minutes} minutes et ${secondes} secondes`
      : `${secondes} secondes`;
  };

  return (
    <div class="flex flex-col w-full">
      <div class="flex flex-row w-full justify-between align-center mt-3 pb-1">
        <h2 class="font-bold">Impact environnemental</h2>
        <button
          class="underline"
          onClick={() =>
            getBrowser().then((browser) =>
              browser.openUrlInNewTab(
                "https://www.ecoindex.fr/comment-ca-marche/#lempreinte-environnementale"
              )
            )
          }
        >
          Comment est réalisée cette estimation ?
        </button>
      </div>

      <div class="flex flex-row w-full align-center mt-2">
        <div class="flex flex-col flex-1">
          <div class="flex flex-row items-center">
            <Cloud />
            <span class="font-bold ml-2">{props.emissionsGES}g CO2e</span>
          </div>
          <span>Emissions de gaz à effet de serre</span>
        </div>
        <div class="flex flex-col flex-1">
          <div class="flex flex-row items-center">
            <WaterDrop />
            <span class="font-bold ml-2">{props.consommationEauBleue} cL</span>
          </div>
          <span>Consommation d'eau bleue</span>
        </div>
      </div>

      <Show when={props.afficherEquivalences}>
        <div class="mt-3">
          <h2 class="font-bold">Mises en perspectives</h2>
          <p>
            Pour vous donner une idée, 1 kg CO2e équivaut à un trajet d’environ
            3 km en voiture. Une douche consomme en moyenne 6 litres d’eau à la
            minute.
            <br />
            <br />
            Si votre parcours émet <strong>
              {props.emissionsGES}g CO2e
            </strong>{" "}
            et consomme <strong>{props.consommationEauBleue}cl d’eau</strong>,
            cela signifie que pour 1000 visiteurs mensuels, l’empreinte est
            de&nbsp;
            {props.emissionsGES}kg de CO2e et {props.consommationEauBleue}{" "}
            litres d’eau par mois – soit un trajet de {kmEquivalents()}km en
            voiture et une douche de {minDoucheEquivalent()}.
          </p>
        </div>
      </Show>
    </div>
  );
}
