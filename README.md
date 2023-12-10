# Ecometrics browser (V 0.1.0)

Ecometrics Browser est une extension pour navigateurs (Chrome, Firefox) permettant de mesurer l'impact environnemental
d'un parcours utilisateur complet sur un service numérique.

Il se fonde sur 3 projets pré-existant.

- [EcoIndex](https://www.ecoindex.fr/)
- [EcoMeter](http://www.ecometer.org/)
- [Green IT Analysis](https://github.com/cnumr/GreenIT-Analysis)

EcoMetrics reprend notamment la méthodologie utilisée par Green IT Analysis, en l'enrichissant de sorte à également fonctionner nativement sur des applications monopages (Single Page Applications). En cela, elle diffère de ses
prédécesseures en permettant une évaluation _dynamique_ de l'impact environnemental des pages web parcourues : vous vérez l'impact environnemental des pages web évoluer au fur et à mesure que leur DOM est modifié, que de nouvelles requêtes sont réalisées, etc.

## Utilisation

Pour mesurer l'impact environnemental d'un service, vous pouvez procéder de la manière suivante :

1. Après avoir installé le plug-in, naviguez sur le service que vous souhaitez analyser
2. Ouvrez les outils de développement de votre navigateur
3. Naviguez sur l'onglet "Ecometrics"
4. Complétez au besoin les informations concernant l'enregistrement à réaliser, et paramétrez-le.
5. Cliquez sur "Lancer l'analyse"
6. Réalisez l'ensemble du parcours utilisateur, sans vous soucier du plug-in.
7. Une fois votre parcours terminé, cliquez sur "Terminer l'analyse".
8. Analysez les résultats ainsi obtenus. Vous pouvez récupérer une extration au format csv des indicateurs
   propres à chaque page.

## Limitations connues

L'écoindex est fondé sur l'analyse d'un ensemble de sites de références, avec une page unique. Son calcul n'est
donc pas, de base, [forcément conçu pour des analyses de parcours utilisateurs complexes](https://github.com/cnumr/GreenIT-Analysis/issues/60#issuecomment-1164227873). Pour obtenir une idée précise de l'impact environnemental d'un parcours utilisateur,
rien de mieux qu'une véritable Analyse de Cycle de Vie.

Cependant, dans une première approche, nous considérons que la méthodologie expliquée dans le
[README de GreenIT Analysis](https://github.com/cnumr/GreenIT-Analysis#enregistrement-du-parcours-utilisateur) peut tout de même
être pertinente pour ressortir un indicateur global de l'éco-conception d'un service numérique.

## Développement

### Architecture du projet

L'interface utilisateur de ce plugin est réalisée avec le framework [SolidJS](https://www.solidjs.com/) et est
compilée avec [Vite](https://vitejs.dev/). Les scripts d'extension sont quant à eux compilés séparément en utilisant
[esbuild](https://esbuild.github.io). L'ensemble est développé en Typescript.

Le projet est structuré comme suit :

- le manifeste de l'extension est localisé dans le répertoire [src/public](./src/public/), ce qui lui permettra d'être à
  la racine du dossier `dist` après la compilation du projet
- les fichiers permettant d'initialiser l'application dans un nouvel onglet des outils de développements sont localisés
  dans le répertoire [src/devtools](./src/devtools)
- les scripts (service worker, content scripts, etc) sont localisés sans le répertoire [src/scripts](./src/scripts)
- l'application SolidJS qui tournera dans les outils de développement est localisée dans le répertoire [src/app](./src/app)

L'application en elle-même est décomposée en différentes couches :

- le répertoire [ui](src/app/ui) contient les éléments visuels principaux de l'application (page, composants...), écrits en tsx
- le répertoire [domain](src/app/domain) décrit les interfaces utilisées dans l'application, ainsi que les fonctions métier
  permettant de calculer l'impact d'une page
- le répertoire [infra](src/app/infra) contient tout le code spécifique à la plateforme d'exécution (Chrome ou Firefox), comme les extensions
  `chrome.\*`

### Différences entre les versions Firefox et Chrome

Bien que les deux versions des navigateurs supportent le [Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3?hl=fr), leur implémentation diffère quelque peu. Alors que Chrome permet aux scripts s'exécutant dans les DevTools
d'accéder aux APIs `chrome.scripting`, cela n'est pas le cas sur Firefox. Nous avons donc du adopter nos choix d'architecture
différent sur chaque plateforme :

- Sur Chrome, la classe [BrowserChrome](./src/app/infra/browser-chrome.ts) intéragit directement avec le navigateur en y
  injectant les scripts et les fonctions nécessaires.
- Sur Firefox, la classe [BrowserFirefox](./src/app/infra/browser-firefox.ts) interagit avec un
  [script de fond](./src/scripts/background.ts), qui fait passe-plat entre DevTools et scripts de contenu. Ces derniers sont
  d'ailleurs directement injectés depuis le manifeste.

Pendant le temps de développement, une classe simulant le fonctionnement d'un navigateur est utilisée,
[BrowserMock](./src/app/infra/browser-mock.ts).

Au runtime, l'application décide de quelle implémentation utiliser parmis ces trois disponibles.

### Dépendances

Installez les dépendances du projet avec la ligne de commande suivante :

```bash
$ npm install # or pnpm install or yarn install
```

### Lancement du projet

Lancez le projet en mode développement avec la ligne de commande `npm run dev` ou `npm start`

L'application se lancera alors en mode développement ; vous pourrez y accéder à l'adresse [http://localhost:3000/](http://localhost:3000/).

### Compilation des sources

Vous pouvez compiler le projet avec la ligne de commande `npm run build`.

Les sources seront alors disponibles dans le répertoire `dist`, que vous pourrez directement importer comme extension non
empaquetée dans votre navigateur.

Par défaut, les sources compilées contiennent les manifestes utiles à la fois pour Firefox et Chrome. Vous pouvez cependant
compiler une version du projet spécifique pour l'un de ces deux navigateurs avec la ligne de commande suivante :

```
$ npm run build:firefox
$ npm run build:chrome
```

## Vie privée

Ecometrics Broser s'exécute pûrement dans le navigateur, en y stockant toutes les
données nécessaires à son fonctionnement, y compris les analyses sauvegardées. Il
ne réalise aucun appel réseau, et ne transemt donc aucune information à un
quelconque service tiers.

## License

EcoMetrics Browser est sous license AGPLv3.

```
Copyright (C) 2015 EcoIndex.fr, Frédéric Bordage, (http://ecoindex.fr/quest-ce-que-ecoindex/)
Copyright (C) 2016-2022 Frédéric Bordage
Copyright (C) 2016  The EcoMeter authors (https://gitlab.com/ecoconceptionweb/ecometer)
Copyright (C) 2019-2022  didierfred@gmail.com
Copyright (C) 2023  bastienhub@gmail.com

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

Les facteurs d'impacts environnementaux (quantités de gaz à effet de serre et d'eau) ne sont pas sous licence libre. Tous droits réservés. © Frédéric Bordage. Merci de demander l'autorisation à son auteur pour les utiliser : fbordage@greenit.fr .

Une partie du code provient du projet EcoMeter et Green IT Analysis.
