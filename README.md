# EcoInsights Profiler (V 0.1.0)

EcoInsights Profiler est une extension pour navigateurs (Chrome >= 103, Firefox >= 109) permettant de mesurer l'impact environnemental
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

### Optimisation des images

Lorsque la vérification des bonnes pratiques est activée, deux bonnes pratiques mesurent le gain réel
d'une optimisation des images de la page, en ré-encodant chaque image dans l'extension :

- **« Ne pas redimensionner les images dans le navigateur »** : images plus grandes que leur taille d'affichage
  (multipliée par la densité de l'écran) ; le gain est celui de l'image redimensionnée, dans son propre format ;
- **« Utiliser des formats d'image optimisés »** : JPEG convertis en AVIF, PNG convertis en WebP sans perte.

Les estimations s'exécutent en arrière-plan (« Estimation en cours… (2/5 images) ») ; la note s'affiche lorsqu'elles
sont terminées. Chaque page indique son **gain estimé (images)**, sans double comptage entre les deux pratiques,
et le parcours affiche le total. L'export CSV comporte la colonne « Gain images estimé (ko) ».
Les GIF, ICO, BMP, TIFF, SVG et les images animées ne sont pas évalués.

Les noms de fichiers longs sont raccourcis (12 premiers caractères, « ... », 12 derniers, puis l'extension) ;
le nom complet s'affiche au survol et est lu par les lecteurs d'écran.

#### Comparer une image avec sa version optimisée

Dans la liste des éléments concernés, le nom de chaque image à optimiser est un bouton. Il ouvre une fenêtre de
comparaison qui permet de basculer entre :

- **Originale** et **Redimensionnée** (« Ne pas redimensionner les images dans le navigateur ») ;
- **Originale** et **AVIF** ou **WebP sans perte** (« Utiliser des formats d'image optimisés ») ;
- les deux options précédentes et **Les deux** (redimensionnée et convertie) pour une image signalée par les deux
  pratiques.

Pour chaque version, la fenêtre affiche la résolution, le poids, le format et, pour une version optimisée, le gain
(par exemple « −144 ko (−60 %) »). Par défaut, chaque version est dessinée à la taille de l'image sur la page
(« Même taille que sur la page ») ; l'option **« Taille réelle »** l'affiche à sa résolution native (1 pixel de
l'image = 1 pixel de l'écran) pour inspecter les artefacts de compression.

Les versions optimisées sont générées à la demande, avec les mêmes réglages que l'estimation (leur poids est donc
celui affiché dans la liste), y compris pour une analyse enregistrée. Elles sont conservées en mémoire pendant la
session du panneau (50 Mo au plus) : rouvrir une image est instantané. Si l'image a changé depuis l'analyse, un
avertissement le signale.

### Autres bonnes pratiques vérifiées

Chaque page parcourue est aussi notée (A, B ou C) sur les bonnes pratiques suivantes. Une page sans élément
concerné est notée A.

| Bonne pratique | Ce qui est vérifié |
|---|---|
| Fournir une alternative textuelle aux contenus multimédias | images, `input type="image"`, zones `area` et vidéos sans alternative (`alt`, `aria-label`, `aria-labelledby`, sous-titres) ; un `alt=""` est signalé « à vérifier » |
| Utiliser le chargement paresseux | images et iframes situées sous l'écran initial et chargées sans `loading="lazy"` (ni chargement différé par script) |
| Compresser les fichiers textuels | fichiers HTML, CSS, JS et SVG de plus de 1 ko transférés sans compression, ou en `deflate` |
| Ajouter des entêtes Expires ou Cache-Control | fichiers statiques (scripts, styles, images, polices, médias…) dont les entêtes n'autorisent pas la mise en cache |
| Minifier les fichiers CSS, JavaScript, HTML et SVG | part d'espaces superflus (indentation, fins de ligne, retours à la ligne ; ≥ 5 % et ≥ 1 ko) dans le contenu capturé par les outils de développement ; les fichiers `.min.js`, `.min.mjs` et `.min.css` sont considérés comme minifiés |
| Limiter le nombre de domaines servant les ressources | nombre de noms d'hôtes distincts : A sous 5, B à 5, C au-delà |
| Privilégier HTTP/2 à HTTP/1 | part des requêtes réseau en HTTP/1.x : B sous 10 %, C à partir de 10 % |
| Limiter l'utilisation des GIFs animés | fichiers GIF téléchargés de 5 ko ou plus : B pour un, C au-delà ; les GIF plus légers (pixels de suivi) sont ignorés et seulement mentionnés |
| Éviter la lecture et le chargement automatique des vidéos et des sons | `video` et `audio` avec `autoplay` ou `preload="auto"` |

La minification est analysée en arrière-plan (« Analyse en cours… (2/5 fichiers) »). Seul le contenu déjà capturé
par les outils de développement est lu : un fichier chargé avant le début de l'enregistrement est « non évalué ».
Les éléments contenus dans des iframes ne sont pas inspectés, mais leurs requêtes sont prises en compte.

#### Aperçu des éléments signalés

Dans la liste des éléments concernés, le nom raccourci d'un fichier est un bouton qui ouvre un aperçu :

| Bonne pratique | Aperçu |
|---|---|
| Fournir une alternative textuelle aux contenus multimédias | l'image (tous formats affichables, GIF animés compris) ou la vidéo |
| Utiliser le chargement paresseux | l'image ; pour une iframe, ses données seulement : hôte, type, poids transféré et position |
| Limiter l'utilisation des GIFs animés | le GIF, animé |
| Éviter la lecture et le chargement automatique des vidéos et des sons | un lecteur vidéo ou audio, qui ne démarre jamais seul |
| Utiliser des polices standards | une citation dans la police téléchargée, avec une bascule vers des polices système (« Sans-serif », « Serif », « Mono ») |
| Minifier les fichiers CSS, JavaScript, HTML et SVG | pour un fichier « non minifié », son contenu brut, numéroté et coloré (JavaScript, CSS, HTML et SVG) |

L'aperçu indique la résolution, le format et le poids (pour une vidéo ou un son, la durée et le poids téléchargé
par la page). Une image ou une vidéo est dessinée à sa taille sur la page, ou en « Taille réelle ». Les iframes ne
sont jamais chargées dans l'extension. Les lignes de « Utiliser des polices standards » prennent la forme
« nom du fichier : poids », de la plus lourde à la plus légère.

Le contenu d'un fichier texte est affiché tel quel, sans reformatage, avec ses numéros de ligne (exclus de la
sélection), son type, son poids et son nombre de lignes. Il n'est jamais interprété : aucun script ne s'exécute et
aucune image ni aucun style du fichier n'est chargé. Seuls les 500 000 premiers caractères sont affichés.

Ne sont pas cliquables : les éléments sans fichier (« (sans source) », domaines), les zones `area`, les fichiers
`blob:` et `data:`, les fichiers « non évalués » de la minification, et les polices des analyses enregistrées avant
cette version. Un aperçu ouvert reste en mémoire
pendant la session du panneau (50 Mo au plus, partagés avec la comparaison des images) ; au-delà de 25 Mo, une image
n'est pas affichée.

## Limitations connues

L'écoindex est fondé sur l'analyse d'un ensemble de sites de références, avec une page unique. Son calcul n'est
donc pas, de base, [forcément conçu pour des analyses de parcours utilisateurs complexes](https://github.com/cnumr/GreenIT-Analysis/issues/60#issuecomment-1164227873). Pour obtenir une idée précise de l'impact environnemental d'un parcours utilisateur,
rien ne vaut une véritable Analyse de Cycle de Vie.

Cependant, dans une première approche, nous considérons que la méthodologie expliquée dans le
[README de GreenIT Analysis](https://github.com/cnumr/GreenIT-Analysis#enregistrement-du-parcours-utilisateur) peut tout de même
être pertinente pour ressortir un indicateur global de l'éco-conception d'un service numérique.

Un serveur de développement local (`localhost`) répond en HTTP/1.1 : la pratique « Privilégier HTTP/2 à HTTP/1 »
y est donc notée C. Dans une analyse enregistrée, les lignes « domaine : n requêtes » sont listées page par page :
un même domaine peut apparaître plusieurs fois avec des nombres différents.

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

En développement (`npm run dev`), hors extension, un `MockBrowser` simule un navigateur, et un `FakeImageEstimator`
remplace l'encodage réel des images : aucun fichier WebAssembly n'est chargé.

### Encodage des images

Les estimations d'images utilisent les codecs WebAssembly [`@jsquash/*`](https://github.com/jamsinclair/jSquash)
(mozjpeg, oxipng, WebP, AVIF, redimensionnement Lanczos3), en version mono-thread, exécutés dans un Web Worker dédié
(`src/app/infra/image-codec`). Ils ajoutent environ 5,9 Mo à chaque version de l'extension, chargés uniquement
lorsqu'une estimation en a besoin. Le manifeste autorise `'wasm-unsafe-eval'`, d'où la version minimale de Chrome 103.

### Ajouter une bonne pratique

1. Créez un fichier `src/app/domain/best-practices/rules/<nom>.rule.ts` exportant un `BestPracticeRule` :
   - un `collect()` optionnel, exécuté dans la page (autonome : ni import ni variable externe) ;
   - un `estimations()` optionnel, pur et synchrone, qui liste les transformations d'image à estimer
     (`resize`, `convert` ou `resize-convert`). Elles sont mises en file, dédupliquées et exécutées dans un Web Worker ;
   - un `evaluate()` pur, qui reçoit les données collectées, les requêtes réseau de la page et `estimates`, l'état de
     chaque estimation demandée. Tant qu'une estimation est en cours, il renvoie une `progress` et pas de `compliance`.
   - un `contentAnalyses()` optionnel, pur et synchrone, qui liste les fichiers texte dont le contenu capturé doit
     être mesuré ; `evaluate()` en lit le résultat dans `contents` ;
   - pour les lignes qui nomment un fichier, utilisez `fileLine()` et `capLines()` (`rules/rule-lines.ts`) : le nom
     est alors raccourci dans l'interface.
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

EcoInsights Profiler s'exécute purement dans le navigateur, en y stockant toutes les
données nécessaires à son fonctionnement, y compris les analyses passées.

Pour estimer le gain d'optimisation des images, l'extension peut re-télécharger les images du site analysé,
depuis le cache HTTP du navigateur lorsque c'est possible, si les outils de développement n'en ont pas conservé
le contenu. Il en va de même pour la fenêtre de comparaison des images, y compris sur une analyse enregistrée.
Ces images sont traitées localement, dans l'extension, et les versions optimisées ne sont jamais enregistrées.

Les aperçus des éléments signalés suivent la même règle : une image, une police ou un fichier texte est lu dans le contenu capturé
par les outils de développement, sinon re-téléchargée par l'extension (depuis le cache HTTP lorsque c'est
possible). Lire une vidéo ou un son dans l'aperçu le télécharge depuis l'extension, hors des requêtes mesurées de
l'onglet inspecté ; à l'ouverture, seules ses métadonnées sont chargées. Une police n'est installée que dans le
panneau de l'extension, jamais dans la page analysée, et elle est retirée à la fermeture de l'aperçu. Les iframes
ne sont jamais chargées. Rien de tout cela n'est enregistré.

Pour noter la minification, l'extension lit le contenu des fichiers texte capturé par les outils de développement,
sans jamais le re-télécharger ni l'enregistrer ; seul l'aperçu d'un fichier peut le re-télécharger, pour l'afficher. Aucune information n'est transmise à un quelconque service tiers.

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
