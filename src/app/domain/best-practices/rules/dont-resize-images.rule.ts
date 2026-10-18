import { BestPracticeRule } from "../rule";

export type PageImage = {
  src: string;
  clientWidth: number;
  clientHeight: number;
  naturalWidth: number;
  naturalHeight: number;
};

function isSvg(src: string): boolean {
  if (/^data:image\/svg\+xml/i.test(src)) return true;
  return /\.svg$/i.test(src.split("#")[0].split("?")[0]);
}

export const dontResizeImagesRule: BestPracticeRule<PageImage[]> = {
  id: "DontResizeImagesInBrowser",
  name: "Ne pas redimensionner les images dans le navigateur",
  category: "images",
  collect: () =>
    Array.from(document.querySelectorAll("img")).map((img) => ({
      src: img.src,
      clientWidth: img.clientWidth,
      clientHeight: img.clientHeight,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    })),
  evaluate: ({ page }) => {
    if (page === undefined) {
      return {
        compliance: "A",
        detail: "La page n'a pas pu être inspectée",
      };
    }
    const resized = page.filter(
      (i) =>
        !isSvg(i.src) &&
        i.clientWidth !== 0 &&
        i.clientHeight !== 0 &&
        (i.naturalWidth - i.clientWidth >= 2 ||
          i.naturalHeight - i.clientHeight >= 2)
    );
    if (resized.length === 0) {
      return {
        compliance: "A",
        detail: "Aucune image n'a été redimensionnée dans le navigateur",
      };
    }
    return {
      compliance: "C",
      detail: `${resized.length} image(s) redimensionnée(s) dans le navigateur`,
      offenders: resized.map(
        (i) =>
          `${i.src.split("/").slice(-1)[0]} : affichée en ${i.clientWidth}x${i.clientHeight} au lieu de ${i.naturalWidth}x${i.naturalHeight}`
      ),
    };
  },
};
