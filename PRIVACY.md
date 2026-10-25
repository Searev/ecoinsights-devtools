# Politique de confidentialité : EcoInsights Devtools

*Dernière mise à jour : 25 octobre 2026. English version below.*

EcoInsights Devtools est une extension des outils de développement (Chrome, Firefox). Elle mesure l'impact environnemental d'un parcours utilisateur sur un site web et vérifie des bonnes pratiques d'écoconception. Elle fonctionne **entièrement dans votre navigateur**.

## Ce que l'extension ne fait pas

- Elle ne collecte, ne vend et ne transmet **aucune donnée** à son éditeur ni à un tiers.
- Elle n'utilise ni compte utilisateur, ni mesure d'audience, ni publicité, ni cookie propre.
- Elle n'exécute aucun code distant.

## Données traitées localement

Ces données sont traitées uniquement pendant qu'une analyse est en cours, pour l'onglet inspecté que vous choisissez d'analyser :

- **Requêtes réseau de la page,** telles que les outils de développement les enregistrent :
  - l'adresse ;
  - le statut ;
  - le type ;
  - la taille ;
  - la version du protocole ;
  - les en-têtes de réponse, **à l'exception des cookies** (`Set-Cookie`), qui ne sont jamais conservés.
- **Mesures de la page :**
  - le titre, l'adresse et la description ;
  - la taille du DOM ;
  - les images, médias, polices, iframes et éléments `canvas`, avec leurs dimensions et leurs attributs utiles aux bonnes pratiques, comme les textes alternatifs.
- **Contenu des fichiers** (images, polices, fichiers CSS, JavaScript, HTML et SVG) capturé par les outils de développement. Il sert à estimer les gains d'optimisation, à vérifier la minification et à afficher les aperçus. Ce contenu est traité en mémoire et **n'est jamais enregistré**.

## Données enregistrées sur votre appareil

Les données suivantes sont conservées dans le stockage local de l'extension, sur votre appareil uniquement :

- **Vos analyses :**
  - le nom, la description et l'adresse du service, que vous saisissez ;
  - les pages parcourues, leurs requêtes et leurs résultats.
- **Votre préférence de thème** (Système, Clair ou Sombre).

Vous pouvez supprimer une analyse avec le bouton « Supprimer l'analyse ». La désinstallation de l'extension supprime toutes ses données.

Les analyses enregistrées avec une version antérieure à la 1.0.0 peuvent contenir les en-têtes `Set-Cookie` des réponses ; les supprimer efface ces en-têtes.

L'export CSV n'est créé que lorsque vous le demandez, et le fichier est enregistré là où vous le choisissez.

## Connexions réseau effectuées par l'extension

- **Vers le site analysé uniquement :**
  - lorsque les outils de développement n'ont pas conservé le contenu d'une image, d'une police ou d'un fichier texte, l'extension peut le re-télécharger, depuis le cache HTTP du navigateur lorsque c'est possible ;
  - cela sert à estimer un gain, à comparer des images ou à afficher un aperçu ;
  - ces requêtes partent vers les mêmes adresses que celles déjà demandées par la page. Elles envoient les cookies que votre navigateur détient pour ce site, comme le ferait la page elle-même.
- **Liens que vous ouvrez,** dans un nouvel onglet : ecoindex.fr, rweb.greenit.fr, accessibilite.numerique.gouv.fr, GitHub.

## Action sur le navigateur

Si l'option « Rafraîchir la page au début de l'analyse » est cochée, l'extension **vide le cache HTTP et les service workers du navigateur**, pour tous les sites, puis recharge l'onglet sans cache.

Cela permet de mesurer un premier chargement réaliste. Décochez l'option pour conserver votre cache.

## Permissions demandées

| Permission | Usage |
|---|---|
| `scripting` | Injecter, dans l'onglet inspecté uniquement et pendant une analyse, le script qui mesure la page |
| `tabs` | Lire l'adresse et le titre de l'onglet inspecté, le recharger, et ouvrir les liens de l'extension dans un nouvel onglet |
| `browsingData` | Vider le cache et les service workers lorsque l'option « Rafraîchir la page au début de l'analyse » est cochée |
| Accès à tous les sites (`<all_urls>`) | Analyser le site de votre choix, quel qu'il soit, et en relire les ressources (images, polices, fichiers texte) |

## Contact

Pour toute question : bastienhub@gmail.com

---

# Privacy policy: EcoInsights Devtools

*Last updated: 25 October 2026.*

EcoInsights Devtools is a developer-tools extension for Chrome and Firefox. It measures the environmental impact of a user journey on a website and checks sustainable web design practices. It runs **entirely in your browser**.

## What the extension does not do

- It does **not collect, sell or transmit any data** to its publisher or to any third party.
- It has no user account, analytics, advertising or own cookies.
- It runs no remote code.

## Data processed locally

This data is processed only while an analysis is running, for the inspected tab you choose to analyse:

- **The page's network requests,** as recorded by the developer tools:
  - URL;
  - status;
  - type;
  - size;
  - protocol version;
  - response headers, **except cookies** (`Set-Cookie`), which are never kept.
- **Page measurements:**
  - title, URL and description;
  - DOM size;
  - images, media, fonts, iframes and `canvas` elements, with the dimensions and attributes the best practices need, such as text alternatives.
- **File contents** (images, fonts, CSS, JavaScript, HTML and SVG files) captured by the developer tools. They are used to estimate optimisation gains, check minification and show previews. They are processed in memory and **never stored**.

## Data stored on your device

The following data is kept in the extension's local storage, on your device only:

- **Your analyses:**
  - the service name, description and URL you enter;
  - the visited pages, their requests and their results.
- **Your theme preference** (System, Light or Dark).

You can delete an analysis with the "Supprimer l'analyse" button. Uninstalling the extension deletes all its data.

Analyses saved with a version earlier than 1.0.0 may contain the responses' `Set-Cookie` headers; deleting those analyses removes them.

A CSV export is created only when you ask for it, and the file is saved where you choose.

## Network connections made by the extension

- **To the analysed site only:**
  - when the developer tools did not keep the content of an image, font or text file, the extension may download it again, from the browser's HTTP cache when possible;
  - this is used to estimate a gain, compare images or show a preview;
  - these requests go to addresses the page itself already requested. They send the cookies your browser holds for that site, as the page itself would.
- **Links you open,** in a new tab: ecoindex.fr, rweb.greenit.fr, accessibilite.numerique.gouv.fr, GitHub.

## Action on the browser

When the "Rafraîchir la page au début de l'analyse" option is checked, the extension **clears the browser's HTTP cache and service workers**, for all sites, then reloads the tab without cache.

This makes the first load realistic. Uncheck the option to keep your cache.

## Permissions

| Permission | Use |
|---|---|
| `scripting` | Inject the page-measurement script, only into the inspected tab and only during an analysis |
| `tabs` | Read the inspected tab's URL and title, reload it, and open the extension's links in a new tab |
| `browsingData` | Clear the cache and service workers when "Rafraîchir la page au début de l'analyse" is checked |
| Access to all sites (`<all_urls>`) | Analyse whichever site you choose, and read its resources (images, fonts, text files) again |

## Contact

Questions: bastienhub@gmail.com
