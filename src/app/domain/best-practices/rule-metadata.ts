import type { BestPracticeId } from "../models/best-practice";

export type RuleReferential = "RWEB" | "RGAA";

export interface RuleReference {
  referential: RuleReferential;
  /** "0075" for RWEB, "1.1" for RGAA. */
  code: string;
}

/**
 * Static, never persisted metadata of a best practice (ARCH-DECISION-032).
 * A missing value is an absent property, never "". Texts are verbatim from the
 * RWEB referential (GreenIT.fr, CC BY-NC-ND 4.0) and the RGAA (DINUM).
 * Only `**bold**` is markup. Keep this file free of imports other than types.
 */
export interface RuleMetadata {
  reference?: RuleReference;
  description?: string;
  link?: string;
}

export const RULE_METADATA: Readonly<Record<BestPracticeId, RuleMetadata>> = {
  AddCacheHeaders: {
    reference: { referential: "RWEB", code: "0075" },
    description: "Les en-têtes Expires et Cache-Control définissent la durée pendant laquelle un navigateur doit conserver une ressource dans son cache. Il faut donc en prévoir et les configurer correctement pour les feuilles de styles CSS, les scripts JavaScript et les images. Idéalement, la durée de vie de ces éléments doit être la plus longue possible, afin que le navigateur ne les redemande pas au serveur. On économise ainsi des requêtes HTTP, de la bande passante et des cycles CPU côté serveur.",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0075-ajouter-des-entetes-expires-ou-cache-control",
  },
  AvoidMediaAutoplay: {
    reference: { referential: "RWEB", code: "0106" },
    description: "L'activation automatique des vidéos et des sons (autoplay) au chargement des pages web implique une utilisation de ressources sur chaque tiers (terminal, réseau, datacenter). Dans de nombreux cas, la lecture automatique n'est pas nécessaire. D'autre part, elle attire l'attention de l'utilisateur et peut le détacher du service qui était demandé. Ces lectures doivent donc se faire à la demande de l'utilisateur en ne mettant pas en place l'attribut autoplay dans les balises <video> ou <audio>.",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0106-eviter-la-lecture-et-le-chargement-automatique-des-videos-et-des-sons",
  },
  CompressTextFiles: {
    reference: { referential: "RWEB", code: "0076" },
    description: "Pour limiter l’utilisation de la bande passante et améliorer les temps de chargement, compressez les fichiers texte : CSS, JS, HTML et SVG. L’algorithme permet de compresser à la volée les ressources avant de les envoyer aux clients.",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0076-compresser-les-fichiers-css-javascript-html-et-svg",
  },
  DontResizeImagesInBrowser: {
    reference: { referential: "RWEB", code: "0048" },
    description: "Idéalement, la taille d’affichage d’une image dans le navigateur doit être la plus proche possible de celle du fichier image téléchargée. Dans le cadre des intégrations modernes, avec les images responsives il faut bien définir les attributs srcset ou sources pour que chaque type d’appareil utilise une version d’image adaptée à la taille et à la résolution de son écran.",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0048-ne-pas-redimensionner-les-images-cote-navigateur",
  },
  ExternalizeCssJs: {
    reference: { referential: "RWEB", code: "0042" },
    description: "Veiller à ce que les codes CSS et JavaScript ne soient pas embarqués dans le code HTML de la page, à l’exception d’éventuelles variables de configuration pour les objets JavaScript.",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0042-externaliser-les-css-et-javascript",
  },
  LimitCanvas: {
    reference: { referential: "RWEB", code: "0055" },
    description: "L’élément HTML canvas est initialement conçu pour dessiner des graphiques, réaliser des jeux ou générer des images à la volée via des API JavaScript. Comme chaque script, l’utilisation de canvas consomme beaucoup de ressources CPU/GPU, ce qui se traduit par une sensation de lenteur sur les terminaux les moins véloces, poussant l’utilisateur à les remplacer.",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0055-limiter-le-recours-aux-canvas",
  },
  LimitCssFiles: {
    reference: { referential: "RWEB", code: "0035" },
    description: "Nous préconisons de limiter le nombre de CSS pour ne pas multiplier les requêtes HTTP et pour simplifier le rendu côté navigateur. Utilisez une feuille de styles commune pour tous les éléments communs, quel que soit l’affichage, et un fichier par résolution cible ou media query. Attention, il faut intégrer ces fichiers directement dans le code HTML et non avec des directives @import dans les fichiers CSS eux-mêmes. En découpant de la sorte, le terminal de l’utilisateur choisira ce qui lui correspond et dépriorisera le chargement des fichiers dont il a n’a pas besoin. Le cas échéant, des fichiers CSS pour certains composants peuvent être chargés en fonction du contexte.",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0035-limiter-le-nombre-de-css",
  },
  LimitDomains: {
    reference: { referential: "RWEB", code: "0082" },
    description: "Lorsqu’un site web ou un service en ligne héberge les composants d’une page web sur plusieurs domaines, le navigateur doit établir une connexion HTTP avec chacun de ces domaines. Une fois la page HTML récupérée, le navigateur appelle les ressources au fur et à mesure qu’il parcourt le DOM. Cela peut rallonger le délai d’attente avant que la page soit opérationnelle. Dans la mesure du possible, il faut donc regrouper toutes les ressources sur un seul domaine.",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0082-limiter-le-nombre-de-domaines-servant-les-ressources",
  },
  LimitGifs: {
    reference: { referential: "RWEB", code: "0099" },
    description: "Le gif animé, format image animée datant de 1995, est plus lourd et plus lent que d'autres formats tels que les formats vidéo webm ou le mp4. Le webp animé est moindre dans son gain de poids et est actuellement peu supporté par les navigateurs.",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0099-limiter-l-utilisation-des-gifs-animes",
  },
  LimitRequests: {
    reference: { referential: "RWEB", code: "0047" },
    description: "Le temps de chargement d’une page côté navigateur est directement corrélé au nombre de fichiers que le navigateur doit télécharger, et au poids unitaire de chaque fichier. Pour chaque fichier, le navigateur émet un GET HTTP vers le serveur. Il attend sa réponse, puis télécharge la ressource dès qu’elle est disponible. Selon le type de serveur web que vous utilisez, plus le nombre de requêtes par page est important, moins vous pourrez servir de pages par serveur. Diminuer le nombre de requêtes par page est crucial pour réduire le nombre de serveurs HTTP (voire des serveurs d'application et de base de données) nécessaires au fonctionnement du site, et donc les impacts environnementaux associés.",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0047-limiter-le-nombre-de-requetes-http",
  },
  MinifyTextFiles: {
    reference: { referential: "RWEB", code: "0077" },
    description: "Utiliser un outil de minification CSS, JavaScript, HTML et SVG permet de supprimer les espaces inutiles, les commentaires des développeurs, les sauts de ligne, les délimiteurs de blocs, etc. et ainsi de réduire leur taille.",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0077-minifier-les-fichiers-css-javascript-html-et-svg",
  },
  UseOptimizedImageFormats: {
    reference: { referential: "RWEB", code: "0049" },
    description: "Réduire le poids des images consiste tout d’abord à choisir un format adapté. Réservez les images matricielles aux photos et aux éléments de l’interface qui ne peuvent pas être pris en charge par des icônes ou des styles CSS. Le choix du format dépend des caractéristiques de l’image. Le fait de pouvoir dégrader l’image définitivement (lossy) oriente plutôt vers les formats JPEG, JPEG XL, AVIF ou WEBP, tandis qu’un besoin de transparence et/ou l’impossibilité de dégrader l’image (lossless) orientent vers un format PNG ou WEBP lossless.",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0049-optimiser-les-images",
  },
  PreferHttp2: {
    reference: { referential: "RWEB", code: "0083" },
    description: "Le protocole HTTP/1 charge les ressources de manière séquentielle. Si une ressource est volumineuse ou ne peut pas être chargée, elle bloque le chargement des ressources suivantes, ce qui donne une impression de lenteur à l’utilisateur.\nHTTP/2 est plus performant que HTTP/1, c’est un protocole binaire (il fait transiter moins d’octets) de plus il permet :\n– le **multiplexage** : envoyer toutes les ressources en une fois tout en utilisant qu’une connexion TCP ;\n– la **priorisation** : le développeur peut indiquer l’ordre de chargement des ressources (ce qui permet d’afficher en priorité les ressources indispensables à l’affichage de la page) ;\n– la compression HPACK : une méthode de compression avancée qui élimine les informations redondantes dans les paquets d’en-tête HTTP ;\n– le push serveur : autorisant un serveur à « pousser » le contenu vers un client avant que le client ne le demande (attention à ne pas abuser de cette fonctionnalité).",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0083-privilegier-http2-a-http1",
  },
  PrintStyleSheet: {
    reference: { referential: "RWEB", code: "0031" },
    description: "Outre le service apporté à l’internaute, cette feuille de styles réduit le nombre de pages imprimées, et donc indirectement l’empreinte écologique du site web. La plus dépouillée possible, cette feuille de styles masque l’entête (header), le pied de page (footer), le menu, les éléments connexes (sidebar) et supprime toutes les images sauf celles du contenu, etc.",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0031-fournir-une-css-print",
  },
  ProvideTextAlternatives: {
    reference: { referential: "RGAA", code: "1.1" },
    description: "Chaque image porteuse d'information doit posséder une alternative textuelle, afin de permettre aux utilisateurs de lecteurs d'écran (ou lorsque l'affichage des images est désactivé) de comprendre l'information transmise par un élément visuel",
    link: "https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/#1.1",
  },
  UseStandardFonts: {
    reference: { referential: "RWEB", code: "0032" },
    description: "Préférer les polices standards, car elles sont déjà présentes sur l’ordinateur de l’utilisateur, qui n’a donc pas besoin de les télécharger. On économise ainsi de la bande passante, tout en accélérant l’affichage du site. Ces polices standards sont listées sur https://systemfontstack.com/, par exemple.",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0032-favoriser-les-polices-standards",
  },
  UseLazyLoading: {
    reference: { referential: "RWEB", code: "0051" },
    description: "Lorsqu’un internaute ne consulte pas la totalité d’une page web, toutes les ressources (images, vidéos, iframes…) situées en dehors de la zone visible, en dessous de la ligne de flottaison, sont chargées inutilement. Évitez cela via la technique du chargement paresseux (lazy loading) qui consiste à ne charger un élément que lorsque son emplacement devient visible à l’écran. En HTML5, il est possible d’ajouter un attribut loading à vos images et à vos iframes pour que le navigateur ne télécharge que les ressources qui apparaissent à l’écran.",
    link: "https://rweb.greenit.fr/fr/fiches/RWEB_0051-utiliser-le-chargement-paresseux",
  },
};

/** The metadata of a rule, or `{}` for an unknown id (a rule removed since the analysis was saved). */
export function ruleMetadata(id: BestPracticeId): RuleMetadata {
  return Object.prototype.hasOwnProperty.call(RULE_METADATA, id) ? RULE_METADATA[id] : {};
}
