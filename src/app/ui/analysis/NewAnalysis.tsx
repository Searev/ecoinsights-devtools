import { Component, Show, createResource } from "solid-js";
import { useEcoInsightsStore } from "../../store";
import Logo from "../shared/icons/Logo";
import { useNavigate } from "@solidjs/router";
import { Analysis } from "../../domain/models/analysis";
import { getBrowser } from "../../infra/browser-factory";
import { getBooleanFormValue, getFormValue } from "../../helpers/form.helpers";
import { getUrl } from "../../helpers/url.helper";
import Loader from "../shared/Loader/Loader";

const ANALYSIS_FORM_ID = "newAnalysisForm";

interface NewAnalysisFormParams {
  name: string;
  description: string;
  url: string;
  refreshOnStart: string;
  triggerNewPageOnLinkClicked: string;
  triggerNewPageOnFormSubmitted: string;
}

async function getInspectedTabSuggestion() {
  const browser = await getBrowser();
  const hasPermission = await browser.checkPermission();

  if (!hasPermission) {
    return null;
  }

  return browser.getPageDescription();
}

const NewAnalysis: Component = () => {
  const navigate = useNavigate();
  const store = useEcoInsightsStore()!;
  const [suggestion, { refetch }] = createResource(getInspectedTabSuggestion);

  function submit(event: Event) {
    event.preventDefault();
    const formValue = getFormValue<NewAnalysisFormParams>(ANALYSIS_FORM_ID);

    const analysis: Analysis = {
      id: window.crypto.randomUUID().toString(),
      date: new Date(),
      service: {
        id: window.crypto.randomUUID().toString(),
        name: formValue["name"],
        description: formValue["description"],
        url: formValue["url"],
      },
      pages: [],
    };
    store.addAnalysis(analysis);

    const url = getUrl(`/analysis/${analysis.id}/recording`, {
      refreshOnStart: getBooleanFormValue(formValue, "refreshOnStart"),
      triggerNewPageOnLinkClicked: getBooleanFormValue(
        formValue,
        "triggerNewPageOnLinkClicked"
      ),
      triggerNewPageOnFormSubmitted: getBooleanFormValue(
        formValue,
        "triggerNewPageOnFormSubmitted"
      ),
    });

    navigate(url.toString());
  }

  return (
    <Show
      when={!suggestion.loading}
      fallback={
        <div class="flex flex-col items-center p-3 w-100">
          <Loader />
          <span class="mt-2">Chargement des informations du site en cours</span>
        </div>
      }
    >
      <Show
        when={suggestion() != null}
        fallback={
          <div class="m-3 p-3 bg-surface border border-2 rounded">
            <h1>Permission requise</h1>
            <p class="mt-2">
              Afin d'analyser ce service, nous devons accéder aux données de cet
              onglet.
            </p>
            <p class="mt-1">Vous pouvez fournir cette permission :</p>
            <ul class="mt-1 list-disc pl-3">
              <li>
                <strong>Pour ce site uniquement&nbsp;:</strong>&nbsp;en
                sélectionnant "toujours autoriser pour ce site" dans la pop-up
                "Extensions" de votre navigateur
              </li>
              <li>
                <strong>Pour tous les sites&nbsp;:</strong>&nbsp;en allant dans
                la section "Extensions" de votre navigateur et en cochant
                "Accéder à vos données pour tous les sites web"
              </li>
            </ul>
            <button onClick={() => refetch()} class="btn-primary mt-2">
              Ré-essayer
            </button>
          </div>
        }
      >
        <form id={ANALYSIS_FORM_ID} onSubmit={submit} class="p-3">
          <header class="flex flex-row items-center">
            <Logo />
            <div class="flex flex-col mx-3">
              <h1>EcoInsights</h1>
              <p>Nouvelle analyse d’éco-conception</p>
            </div>
            <div class="flex-1" />
            <button type="submit" class="btn-primary">
              Commencer l'analyse
            </button>
          </header>

          <section class="flex flex-col mt-5">
            <label for="serviceName">Nom du service*</label>
            <input
              id="serviceName"
              class="form-field mb-2"
              type="text"
              name="name"
              placeholder="Ex : exemple.org "
              value={suggestion()?.name ?? ""}
              required
            />

            <label for="serviceDescription">Description du service</label>
            <textarea
              id="serviceDescription"
              placeholder="Ex : Site web visant à mesurer l'empreinte environnementale d'un service"
              name="description"
              class="form-field mb-2"
              value={suggestion()?.description ?? ""}
            />

            <label for="serviceName">URL du service*</label>
            <input
              id="serviceUrl"
              class="form-field mb-2"
              type="text"
              name="url"
              placeholder="Ex : exemple.org "
              value={suggestion()?.url ?? ""}
            />

            <span class="font-semibold">Paramètres de l'analyse</span>
            <div class="mb-1">
              <input
                type="checkbox"
                id="refreshOnStart"
                name="refreshOnStart"
                checked
              />
              <label for="refreshOnStart" class="ml-2">
                Raffraîchir la page au début de l'analyse
              </label>
            </div>

            <div class="mb-1">
              <input
                type="checkbox"
                id="triggerNewPageOnLinkClicked"
                name="triggerNewPageOnLinkClicked"
                checked
              />
              <label for="triggerNewPageOnLinkClicked" class="ml-2">
                Déclencer l'analyse d'une nouvelle page dès le clic sur un lien
              </label>
            </div>

            <div class="mb-1">
              <input
                type="checkbox"
                id="triggerNewPageOnFormSubmitted"
                name="triggerNewPageOnFormSubmitted"
                checked
              />
              <label for="triggerNewPageOnFormSubmitted" class="ml-2">
                Déclencer l'analyse d'une nouvelle page dès la soumission d'un
                formulaire
              </label>
            </div>
          </section>
        </form>
      </Show>
    </Show>
  );
};

export default NewAnalysis;
