import { lazy } from "solid-js";

const routes = [
  {
    path: "/analysis",
    children: [
      {
        path: "/:id/recording",
        component: lazy(() => import("./ui/analysis/PendingAnalysis")),
      },
      {
        path: "/:id",
        component: lazy(() => import("./ui/analysis/SavedAnalysis")),
      },
    ],
  },
  {
    path: "/a-propos",
    component: lazy(() => import("./ui/about/About")),
  },
  {
    path: "*",
    component: lazy(() => import("./ui/home/Home")),
  },
];

export default routes;
