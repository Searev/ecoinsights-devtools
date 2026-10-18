import { Show } from "solid-js";
import { useEcoInsightsStore } from "../../store";

export default function SaveErrorBanner() {
  const store = useEcoInsightsStore()!;

  return (
    <Show when={store.saveError()}>
      {(error) => (
        <div
          role="alert"
          class="flex flex-row items-center m-3 p-3 bg-surface border-2 border-red-500 rounded"
        >
          <p class="flex-1">
            {error() === "quota"
              ? "Espace de stockage plein : vos analyses n'ont pas pu être sauvegardées. Supprimez d'anciennes analyses pour libérer de la place."
              : "Une erreur est survenue : vos analyses n'ont pas pu être sauvegardées."}
          </p>
          <button
            type="button"
            class="btn-secondary ml-2"
            onClick={() => store.dismissSaveError()}
          >
            Fermer
          </button>
        </div>
      )}
    </Show>
  );
}
