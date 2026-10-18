/* eslint-disable no-unused-vars */
import { createStore } from "solid-js/store";
import { Analysis } from "./domain/models/analysis";
import { Service } from "./domain/models/service";
import { createContext, createSignal, useContext } from "solid-js";
import { isQuotaExceeded, parseStoredData, serializeStoredData } from "./store-codec";

const STORE_KEY = "ECOINSIGHTS_PROFILER_STORE";

export type SaveError = "quota" | "unknown";

export class EcoInsightsStore {
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

  /** Persists the store. Returns the failure reason instead of throwing, `null` on success. */
  save(): SaveError | null {
    try {
      localStorage.setItem(
        STORE_KEY,
        serializeStoredData(this.services, this.analysis)
      );
      return null;
    } catch (e) {
      return isQuotaExceeded(e) ? "quota" : "unknown";
    }
  }

  static restore(): EcoInsightsStore {
    let json: string | null = null;
    try {
      json = localStorage.getItem(STORE_KEY);
    } catch {
      // Storage unavailable: start empty.
    }
    const { services, analysis } = parseStoredData(json);
    return new EcoInsightsStore(services, analysis, undefined);
  }
}

export interface EcoInsightsStoreValue {
  store: EcoInsightsStore;
  /** Set when the last save failed (e.g. localStorage full); cleared by the next successful save. */
  saveError: () => SaveError | null;
  dismissSaveError(): void;
  addService(service: Service): void;
  updateService(id: string, service: Service): void;
  removeService(id: string): void;
  addAnalysis(analysis: Analysis): void;
  saveAnalysis(analysis: Analysis): void;
  removeAnalysis(id: string): void;
  setCurrentAnalysis(id: string): void;
}

const EcoInsightsStoreContext = createContext<EcoInsightsStoreValue>();

export function EcoInsightsStoreProvider(props: any) {
  const [store, setStore] = createStore<EcoInsightsStore>(
    EcoInsightsStore.restore()
  );

  const [saveError, setSaveError] = createSignal<SaveError | null>(null);
  const persist = () => setSaveError(store.save());

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
    persist();
  };

  const saveAnalysis = (analysis: Analysis) => {
    setStore("analysis", (previousAnalysis) =>
      previousAnalysis.map((el) => (el.id === analysis.id ? analysis : el))
    );
    persist();
  };

  const removeAnalysis = (id: string) => {
    setStore("analysis", (previousAnalysis) =>
      previousAnalysis.filter((el) => el.id != id)
    );
    persist();
  };

  const setCurrentAnalysis = (id: string | undefined) => {
    setStore("currentAnalysisId", id);
  };

  const value: EcoInsightsStoreValue = {
    store,
    saveError,
    dismissSaveError: () => setSaveError(null),
    addService,
    updateService,
    removeService,
    addAnalysis,
    removeAnalysis,
    saveAnalysis,
    setCurrentAnalysis,
  };

  return (
    <EcoInsightsStoreContext.Provider value={value}>
      {props.children}
    </EcoInsightsStoreContext.Provider>
  );
}

export function useEcoInsightsStore() {
  return useContext(EcoInsightsStoreContext);
}
