import { Component, Show, createResource } from "solid-js";
import { useEcometricsStore } from "../../store";
import Logo from "../shared/icons/Logo";
import { useNavigate } from "@solidjs/router";
import { Service } from "../../domain/models/service";
import { Analysis } from "../../domain/models/analysis";
import { getBrowser } from "../../infra/browser-factory";

async function getInspectedTabSuggestion() {
  const browser = await getBrowser();
  return browser.getPageDescription();
}

const NewAnalysis: Component = () => {
  const navigate = useNavigate();
  const store = useEcometricsStore()!;
  const [suggestion] = createResource(getInspectedTabSuggestion);

  function submit(event: Event) {
    event.preventDefault();
    const formValue: any = [
      ...new FormData(
        document.getElementById("newAnalysisForm") as HTMLFormElement
      ).entries(),
    ].reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

    const service: Service = {
      id: window.crypto.randomUUID().toString(),
      name: formValue["name"],
      description: formValue["description"],
      url: formValue["url"],
    };
    store.addService(service);

    const analysis: Analysis = {
      id: window.crypto.randomUUID().toString(),
      date: new Date(),
      service,
      pages: [],
    };
    store.addAnalysis(analysis);

    navigate(
      `/analysis/${analysis.id}/recording?refreshOnStart=${
        formValue["refreshOnStart"] === "on"
      }`
    );
  }

  return (
    <Show when={!suggestion.loading} fallback={"Loading..."}>
      <form id="newAnalysisForm" onSubmit={submit} class="p-3">
        <header class="flex flex-row items-center">
          <Logo />
          <div class="flex flex-col mx-3">
            <h1>EcoMetrics</h1>
            <p>Commencer l’analyse d’éco-conception</p>
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

          <div>
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
        </section>
      </form>
    </Show>
  );
};

export default NewAnalysis;
