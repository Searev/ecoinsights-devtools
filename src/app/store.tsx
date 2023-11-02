/* eslint-disable no-unused-vars */
import { createStore } from "solid-js/store";
import { Analysis } from "./domain/models/analysis";
import { Service } from "./domain/models/service";
import { createContext, useContext } from "solid-js";

const STORE_KEY = "ECOMETRICS_BROWSER_STORE";

export class EcometricsStore {
  services: Service[];
  analysis: Analysis[];
  currentAnalysisId: string | undefined;

  constructor(
    services: Service[] = [],
    analysis: Analysis[] = [],
    currentAnalysis: string | undefined = undefined
  ) {
    this.services = services;
    this.analysis = analysis;
    this.currentAnalysisId = currentAnalysis;
  }

  save() {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        services: this.services,
        analysis: this.analysis,
      })
    );
  }

  static restore(): EcometricsStore {
    const json = localStorage.getItem(STORE_KEY);
    try {
      const decoded = JSON.parse(json ?? "");
      const services = decoded.services ?? [];
      const analysis =
        decoded.analysis?.map((el: any) => ({
          ...el,
          date: new Date(el.date),
          pages: el.pages.map((page: any) => ({
            ...page,
            navigatedAt: new Date(page.navigatedAt),
            requests: page.requests.map((request: any) => ({
              ...request,
              url: new URL(request.url),
            })),
            domProfile: page.domProfile.map((domProfile: any) => ({
              ...domProfile,
              date: new Date(domProfile.date),
            })),
          })),
        })) ?? [];

      return new EcometricsStore(
        services ?? [],
        analysis ?? [], // Améliorer le parsing, avec la gestion des dates
        undefined
      );
    } catch {
      return new EcometricsStore([], [], undefined);
    }
  }
}

export interface EcometricsStoreValue {
  store: EcometricsStore;
  addService(service: Service): void;
  updateService(id: string, service: Service): void;
  removeService(id: string): void;
  addAnalysis(analysis: Analysis): void;
  saveAnalysis(analysis: Analysis): void;
  removeAnalysis(id: string): void;
  setCurrentAnalysis(id: string): void;
}

const EcometricsStoreContext = createContext<EcometricsStoreValue>();

export function EcometricsStoreProvider(props: any) {
  const [store, setStore] = createStore<EcometricsStore>(
    EcometricsStore.restore()
  );

  const addService = (service: Service) => {
    setStore("services", (previousServices) => [...previousServices, service]);
  };

  const updateService = (id: string, service: Service) => {
    setStore("services", (previousServices) =>
      previousServices.map((el) => (el.id === id ? service : el))
    );
  };

  const removeService = (id: string) => {
    setStore("services", (previousServices) =>
      previousServices.filter((el) => el.id != id)
    );
  };

  const addAnalysis = (analysis: Analysis) => {
    setStore("analysis", (previousAnalysis) => [...previousAnalysis, analysis]);
  };

  const saveAnalysis = (analysis: Analysis) => {
    setStore("analysis", (previousAnalysis) =>
      previousAnalysis.map((el) => (el.id === analysis.id ? analysis : el))
    );
    store.save();
  };

  const removeAnalysis = (id: string) => {
    setStore("analysis", (previousAnalysis) =>
      previousAnalysis.filter((el) => el.id != id)
    );
    store.save();
  };

  const setCurrentAnalysis = (id: string | undefined) => {
    setStore("currentAnalysisId", id);
  };

  const value: EcometricsStoreValue = {
    store,
    addService,
    updateService,
    removeService,
    addAnalysis,
    removeAnalysis,
    saveAnalysis,
    setCurrentAnalysis,
  };

  return (
    <EcometricsStoreContext.Provider value={value}>
      {props.children}
    </EcometricsStoreContext.Provider>
  );
}

export function useEcometricsStore() {
  return useContext(EcometricsStoreContext);
}
