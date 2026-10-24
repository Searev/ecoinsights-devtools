import {
  PreviewFileLoader,
  PreviewFileResult,
  PreviewFontInfo,
  PreviewImageInfo,
  PreviewTextInfo,
} from "../../domain/models/file-preview";
import { describePreviewImage } from "./preview-image-info";

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fileName(url: string): string {
  const path = url.split(/[?#]/)[0];
  return path.slice(path.lastIndexOf("/") + 1) || url;
}

/** Dev (`npm run dev`) loader: a synthetic 600 x 400 SVG for images, no fonts. Never rejects. */
export class FakePreviewFileLoader implements PreviewFileLoader {
  async loadImage(url: string): Promise<PreviewFileResult<PreviewImageInfo>> {
    const label = escapeXml(fileName(url));
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">` +
      `<rect width="600" height="400" fill="#cfe8d5"/>` +
      `<text x="300" y="200" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#1b4332">${label}</text>` +
      `</svg>`;
    const bytes = new TextEncoder().encode(svg);
    const info = describePreviewImage(bytes, "image/svg+xml");
    if (!info) return { status: "error", error: "unavailable" };
    return { status: "loaded", bytes, info };
  }

  async loadFont(): Promise<PreviewFileResult<PreviewFontInfo>> {
    return { status: "error", error: "unavailable", message: "aperçu des polices indisponible en mode démo" };
  }

  /** A synthetic, non-minified sample chosen by the URL extension (CSS for anything unknown). */
  async loadText(url: string): Promise<PreviewFileResult<PreviewTextInfo>> {
    const extension = /\.([a-z0-9]+)$/i.exec(url.split(/[?#]/)[0])?.[1]?.toLowerCase() ?? "";
    const sample = TEXT_SAMPLES[extension] ?? TEXT_SAMPLES.css;
    const bytes = new TextEncoder().encode(sample.text);
    return { status: "loaded", bytes, info: { byteLength: bytes.length, mimeType: sample.mimeType, charset: "utf-8" } };
  }
}

interface TextSample {
  text: string;
  mimeType: string;
}

const CSS_SAMPLE: TextSample = {
  mimeType: "text/css",
  text: `/* Feuille de style de démonstration : non minifiée */
:root {
  --couleur-principale: #2d6a4f;
  --espace: 1.5rem;
}

body {
  margin: 0;
  font-family: "Helvetica Neue", sans-serif;
  color: var(--couleur-principale);
}

/* Écrans larges */
@media (min-width: 768px) {
  .carte > .titre::after {
    content: "été";
    padding: calc(var(--espace) * 2) 0;
  }
}
`,
};

const JS_SAMPLE: TextSample = {
  mimeType: "text/javascript",
  text: `// Script de démonstration : non minifié
/* Calcule un total à partir d'une liste */
export function total(prix, taux = 0.2) {
  const message = \`Total (été) : \${prix.length} articles\`;
  let somme = 0;
  for (const valeur of prix) {
    somme += valeur * (1 + taux);
  }
  if (somme > 1000) {
    return "élevé";
  }
  console.log(message, 42, 3.14);
  return somme;
}
`,
};

const HTML_SAMPLE: TextSample = {
  mimeType: "text/html",
  text: `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <title>Démonstration</title>
    <style>
      /* Style intégré */
      .bloc { color: green; margin: 0 auto; }
    </style>
  </head>
  <body>
    <!-- Contenu principal -->
    <main id="contenu" class="bloc" data-état="prêt">
      <h1>Page non minifiée</h1>
    </main>
    <script>
      // Script intégré
      const element = document.getElementById("contenu");
      element.dataset.chargé = "oui";
    </script>
  </body>
</html>
`,
};

const SVG_SAMPLE: TextSample = {
  mimeType: "image/svg+xml",
  text: `<?xml version="1.0" encoding="UTF-8"?>
<!-- Image vectorielle de démonstration -->
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <title>Démo</title>
  <rect x="10" y="10" width="100" height="60" fill="#cfe8d5" stroke="#1b4332"/>
</svg>
`,
};

const JSON_SAMPLE: TextSample = {
  mimeType: "application/json",
  text: `{
  "nom": "démonstration",
  "version": 1.5,
  "actif": true,
  "étiquettes": ["a", "b"],
  "parent": null
}
`,
};

const TEXT_SAMPLES: Record<string, TextSample> = {
  css: CSS_SAMPLE,
  js: JS_SAMPLE,
  mjs: JS_SAMPLE,
  html: HTML_SAMPLE,
  htm: HTML_SAMPLE,
  svg: SVG_SAMPLE,
  json: JSON_SAMPLE,
};
