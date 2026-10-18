import type { Component } from "solid-js";

import { Router, useRoutes } from "@solidjs/router";
import Toolbar from "./Toolbar";
import routes from "./App.routing";
import { EcoInsightsStoreProvider } from "./store";
import SaveErrorBanner from "./ui/shared/SaveErrorBanner";

const App: Component = () => {
  const Routes = useRoutes(routes);
  return (
    <EcoInsightsStoreProvider>
      <Router>
        <SaveErrorBanner />
        <Toolbar />
        <Routes />
      </Router>
    </EcoInsightsStoreProvider>
  );
};

export default App;
