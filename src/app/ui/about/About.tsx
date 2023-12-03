import { Component } from "solid-js";

const About: Component = () => {
  return (
    <div class="p-3">
      <header>
        <h1 class="pb-3">A propos</h1>
      </header>
      <section>
        <p class="pb-2">
          Ecometrics Browser est une extension pour navigateurs (Chrome,
          Firefox) permettant de mesurer l'impact environnemental d'un parcours
          utilisateur complet sur un service numérique.
        </p>
        <p class="pb-2">Il se fonde sur 3 projets pré-existant :</p>
        <ul class="pb-2 px-3 list-disc">
          <li>EcoIndex</li>
          <li>EcoMeter</li>
          <li>Green IT Analysis</li>
        </ul>
        <p class="pb-2">
          EcoMetrics reprend notamment la méthodologie utilisée par Green IT
          Analysis, en l'enrichissant de sorte à également fonctionner
          nativement sur des applications monopages (Single Page Applications).
          En cela, elle diffère de ses prédécesseures en permettant une
          évaluation dynamique de l'impact environnemental des pages web
          parcourues : vous vérez l'impact environnemental des pages web évoluer
          au fur et à mesure que leur DOM est modifié, que de nouvelles requêtes
          sont réalisées, etc.
        </p>
      </section>
    </div>
  );
};

export default About;
