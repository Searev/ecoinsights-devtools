import type { Component } from "solid-js";

import { Router, useRoutes } from "@solidjs/router";
import Toolbar from "./Toolbar";
import routes from "./App.routing";
import { EcometricsStoreProvider } from "./store";

const App: Component = () => {
  const Routes = useRoutes(routes);
  return (
    <EcometricsStoreProvider>
      <Router>
        <Toolbar />
        <Routes />
      </Router>
    </EcometricsStoreProvider>
  );
};

export default App;
