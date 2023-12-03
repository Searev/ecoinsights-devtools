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
- le répertoire [infra](src/app/infra) contient tout le code spécifique à la plateforme d'exécution, comme les extensions
  `chrome.\*`

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
