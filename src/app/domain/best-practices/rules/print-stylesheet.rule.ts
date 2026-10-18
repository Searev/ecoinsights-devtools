import { BestPracticeRule } from "../rule";

/** Number of print stylesheets found in the page. */
export const printStylesheetRule: BestPracticeRule<number> = {
  id: "PrintStyleSheet",
  name: "Fournir une print css",
  category: "css",
  collect: () =>
    document.querySelectorAll(
      "link[rel=stylesheet][media~=print], style[media~=print]"
    ).length,
  evaluate: ({ page }) => {
    if (page === undefined) {
      return {
        compliance: "A",
        detail: "La page n'a pas pu être inspectée",
      };
    }
    return page > 0
      ? { compliance: "A", detail: "La page dispose d'une print css" }
      : { compliance: "C", detail: "Pas de Print CSS trouvée" };
  },
};
