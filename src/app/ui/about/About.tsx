import { Component, For } from "solid-js";
import { useBrowser } from "../../infra/browser-context";

const CREDIT_LINKS = [
  { label: "rweb.greenit.fr", url: "https://rweb.greenit.fr/fr" },
  { label: "collectif.greenit.fr", url: "https://collectif.greenit.fr" },
  { label: "ecoconceptionweb.com", url: "https://www.ecoconceptionweb.com" },
  {
    label: "Licence CC BY-NC-ND 4.0",
    url: "https://creativecommons.org/licenses/by-nc-nd/4.0/deed.fr",
  },
];

const CREDIT_ECOINDEX = [
  { label: "EcoIndex", url: "https://ecoindex.fr/" },
  { label: "Green IT Analysis", url: "https://github.com/cnumr/GreenIT-Analysis" },
]

const About: Component = () => {
  const browser = useBrowser();
  return (
    <div class="p-3">
      <header>
        <h1 class="pb-3">À propos</h1>
      </header>
      <section>
        <p class="pb-2">
          EcoInsights Devtools est une extension pour navigateurs (Chrome,
          Firefox) permettant de mesurer l'impact environnemental d'un parcours
          utilisateur complet sur un service numérique.
        </p>
        <p class="pb-2">Elle se fonde sur différents projets préexistants :</p>
        <ul class="pb-2 px-3 list-disc">
          <For each={CREDIT_ECOINDEX}>
            {(link) => (
              <li>
                <button
                  type="button"
                  class="underline"
                  onClick={() => browser.openUrlInNewTab(link.url)}
                >
                  {link.label}
                </button>
              </li>
            )}
          </For>
          </ul>

        <p class="pb-2">
          EcoInsights Devtools reprend notamment la méthodologie utilisée par Green IT
          Analysis, en l'enrichissant de sorte à également fonctionner
          nativement sur des applications monopages (Single Page Applications).
          En cela, elle diffère de ses prédécesseurs en permettant une
          évaluation dynamique de l'impact environnemental des pages web
          parcourues : vous verrez l'impact environnemental des pages web évoluer
          au fur et à mesure que leur DOM est modifié, que de nouvelles requêtes
          sont réalisées, etc.
        </p>
      </section>
      <section>
        <h2 class="font-bold pb-2">Crédits des bonnes pratiques</h2>
        <p class="pb-2">
          Les descriptions des bonnes pratiques référencées RWEB sont extraites
          du Référentiel d'écoconception web (RWEB), publié par GreenIT.fr dans
          le cadre des travaux du Collectif conception numérique responsable,
          sous licence Creative Commons BY-NC-ND 4.0.
        </p>
        <ul class="pb-2 px-3 list-disc">
          <For each={CREDIT_LINKS}>
            {(link) => (
              <li>
                <button
                  type="button"
                  class="underline"
                  onClick={() => browser.openUrlInNewTab(link.url)}
                >
                  {link.label}
                </button>
              </li>
            )}
          </For>
        </ul>
        <p class="pb-2">
          Le critère RGAA 1.1 provient du RGAA 4.1 (DINUM), sous Licence
          Ouverte 2.0.{" "}
          <button
            type="button"
            class="underline"
            onClick={() =>
              browser.openUrlInNewTab("https://accessibilite.numerique.gouv.fr")
            }
          >
            accessibilite.numerique.gouv.fr
          </button>
        </p>
      </section>
    </div>
  );
};

export default About;
