# EcoInsights Profiler (V 0.1.0)

EcoInsights Profiler est une extension pour navigateurs (Chrome >= 88, Firefox >= 109) permettant de mesurer l'impact environnemental
d'un parcours utilisateur complet sur un service numérique.

Il se fonde sur 3 projets pré-existant.

- [EcoIndex](https://www.ecoindex.fr/)
- [EcoMeter](http://www.ecometer.org/)
- [Green IT Analysis](https://github.com/cnumr/GreenIT-Analysis)

EcoInsights reprend notamment la méthodologie utilisée par Green IT Analysis, en l'enrichissant de sorte à également fonctionner nativement sur des applications monopages (Single Page Applications). En cela, elle diffère de ses
prédécesseures en permettant une évaluation _dynamique_ de l'impact environnemental des pages web parcourues : vous vérez l'impact environnemental des pages web évoluer au fur et à mesure que leur DOM est modifié, que de nouvelles requêtes sont réalisées, etc.

## Utilisation

Pour mesurer l'impact environnemental d'un service, vous pouvez procéder de la manière suivante :

1. Après avoir installé le plug-in, naviguez sur le service que vous souhaitez analyser
2. Ouvrez les outils de développement de votre navigateur
3. Naviguez sur l'onglet "EcoInsights"
4. Complétez au besoin les informations concernant l'enregistrement à réaliser, et paramétrez-le.
5. Cliquez sur "Lancer l'analyse"
6. Réalisez l'ensemble du parcours utilisateur, sans vous soucier du plug-in.
7. Une fois votre parcours terminé, cliquez sur "Terminer l'analyse".
8. Analysez les résultats ainsi obtenus. Vous pouvez récupérer une extration au format csv des indicateurs
   propres à chaque page.

## Limitations connues

L'écoindex est fondé sur l'analyse d'un ensemble de sites de références, avec une page unique. Son calcul n'est
donc pas, de base, [forcément conçu pour des analyses de parcours utilisateurs complexes](https://github.com/cnumr/GreenIT-Analysis/issues/60#issuecomment-1164227873). Pour obtenir une idée précise de l'impact environnemental d'un parcours utilisateur,
rien ne vaut une véritable Analyse de Cycle de Vie.

Cependant, dans une première approche, nous considérons que la méthodologie expliquée dans le
[README de GreenIT Analysis](https://github.com/cnumr/GreenIT-Analysis#enregistrement-du-parcours-utilisateur) peut tout de même
être pertinente pour ressortir un indicateur global de l'éco-conception d'un service numérique.

## Développement

### Architecture du projet

L'interface utilisateur de ce plugin est réalisée avec le framework [SolidJS](https://www.solidjs.com/) et est
compilée avec [Vite](https://vitejs.dev/). Les scripts d'extension sont quant à eux compilés séparément en utilisant
[esbuild](https://esbuild.github.io). L'ensemble est développé en Typescript.

Le calcul de l'EcoIndex repose sur un dépot de référence : [https://github.com/cnumr/ecoindex_reference](https://github.com/cnumr/ecoindex_reference)

L'architecture détaillée et les décisions qui la justifient sont documentées dans
[docs/architecture](./docs/architecture/ARCHITECTURE.md).

Le projet est structuré comme suit :

- [src/manifest](./src/manifest) : manifeste commun (`base.json`) et surcharges propres à Chrome et à Firefox, fusionnés à la compilation
- [src/devtools](./src/devtools) : enregistrement de l'onglet « EcoInsights » dans les outils de développement
- [src/app](./src/app) : l'application SolidJS affichée dans cet onglet
- [src/background](./src/background) : l'« agent de page », script de fond qui agit sur l'onglet inspecté (scripts injectés, rechargement, permissions)
- [src/content](./src/content) : la « sonde », script de contenu injecté à la demande pour détecter les clics sur les liens et les soumissions de formulaires
- [src/shared/protocol.ts](./src/shared/protocol.ts) : le protocole typé échangé entre l'onglet DevTools et l'agent de page

L'application en elle-même est décomposée en différentes couches :

- [ui](src/app/ui) : pages et composants SolidJS ; ils obtiennent le navigateur via `useBrowser()`
- [domain](src/app/domain) : modèles, cas d'usage (enregistrement d'un parcours, calcul de l'EcoIndex, export CSV) et
  [règles de bonnes pratiques](src/app/domain/best-practices). Cette couche n'utilise jamais `chrome.*` ni `infra` (vérifié par ESLint)
- [infra](src/app/infra) : implémentations de l'interface `Browser` : `ExtensionBrowser` (Chrome et Firefox) et `MockBrowser` (développement et tests)

### Chrome et Firefox

Les deux navigateurs partagent exactement le même code. Les DevTools de Firefox ne pouvant pas utiliser `scripting` ni `tabs`,
tout accès à l'onglet inspecté passe, sur les deux navigateurs, par l'agent de page. Celui-ci est déclaré comme
`service_worker` sur Chrome et comme `background.scripts` sur Firefox. Seul le manifeste diffère.

En développement (`npm run dev`), hors extension, un `MockBrowser` simule un navigateur.

### Ajouter une bonne pratique

1. Créez un fichier `src/app/domain/best-practices/rules/<nom>.rule.ts` exportant un `BestPracticeRule` :
   un `collect()` optionnel, exécuté dans la page (autonome : ni import ni variable externe), et un `evaluate()` pur,
   qui reçoit les données collectées et les requêtes réseau de la page.
2. Ajoutez la règle au tableau `RULES` de [index.ts](src/app/domain/best-practices/index.ts).
3. Ajoutez un fichier de test `<nom>.rule.test.ts`. Le test du registre vérifie automatiquement que `collect` est autonome.

Aucune autre modification n'est nécessaire : la règle fonctionne sur Chrome et Firefox.

### Dépendances

Installez les dépendances du projet avec la ligne de commande suivante :

```bash
$ npm install # or pnpm install or yarn install
```

### Lancement du projet

Lancez le projet en mode développement avec la ligne de commande `npm run dev` ou `npm start`

L'application se lancera alors en mode développement ; vous pourrez y accéder à l'adresse [http://localhost:3000/](http://localhost:3000/).

### Compilation des sources

Vous pouvez compiler le projet avec la ligne de commande `npm run build`, qui produit une version par navigateur :

- `dist/chrome` et `dist/chrome.zip`
- `dist/firefox` et `dist/firefox.zip`

Chaque dossier peut être importé directement comme extension non empaquetée : `chrome://extensions` en mode
développeur sur Chrome, `about:debugging` → « Charger un module temporaire » → `dist/firefox/manifest.json` sur Firefox.

Pour ne compiler qu'un seul navigateur :

```
$ npm run build:firefox
$ npm run build:chrome
```

`npm run lint:firefox` valide la version Firefox avec `web-ext lint`.

### Tests et qualité

```
$ npm test            # tous les tests (Vitest)
$ npx vitest run src/app/domain/best-practices   # un sous-ensemble
$ npm run typecheck   # vérification TypeScript
$ npm run lint        # ESLint
```

Les tests sont placés à côté du code (`*.test.ts`). Le code exécuté dans la page est testé avec jsdom
(`// @vitest-environment jsdom`). Les dépendances au navigateur sont injectées (faux objets `chrome`, `MockBrowser`)
plutôt que simulées avec `vi.mock`.

## Vie privée

EcoInsights Broser s'exécute pûrement dans le navigateur, en y stockant toutes les
données nécessaires à son fonctionnement, y compris les analyses passées. Il
ne réalise aucun appel réseau, et ne transemt donc aucune information à un
quelconque service tiers.

## License

EcoInsights Profiler est sous license AGPLv3.

```
Copyright (C) 2015       EcoIndex.fr, Frédéric Bordage (https://www.ecoindex.fr/a-propos/)
Copyright (C) 2016-2022  Frédéric Bordage
Copyright (C) 2016       The EcoMeter authors (https://gitlab.com/ecoconceptionweb/ecometer)
Copyright (C) 2019-2022  GreenIT Analysis, didierfred@gmail.com (https://github.com/cnumr/GreenIT-Analysis)
Copyright (C) 2024       EcoInsights, bastienhub@gmail.com

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
```

Le texte complet de la license se trouve dans le fichier [LICENSE](./LICENSE).

La formule de l'EcoIndex est sous license [CC By-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.fr)

Les facteurs d'impacts (ACV) utilisés par EcoInsights pour évaluer les impacts environnementaux ne sont pas sous licence libre - © Frédéric Bordage.
Merci de demander l'autorisation à son auteur pour les utiliser : fbordage at greenit.fr

Une partie du code provient du projet EcoMeter et Green IT Analysis.
