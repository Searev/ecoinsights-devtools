import { BestPracticeRule } from "../rule";

export type FontsPageData = { families: string[] };

const FONT_EXT = /\.(woff2?|ttf|otf|eot)$/i;
const MAX_B_SIZE = 100_000;

export const standardFontsRule: BestPracticeRule<FontsPageData> = {
  id: "UseStandardFonts",
  name: "Utiliser des polices standards",
  category: "fonts",
  collect: () => {
    const families: string[] = [];
    const fonts: any = (document as any).fonts;
    if (fonts) {
      fonts.forEach((f: any) => {
        if (f.status !== "loaded") return;
        const family = String(f.family).replace(/^["']|["']$/g, "");
        if (families.indexOf(family) === -1) families.push(family);
      });
    }
    return { families };
  },
  evaluate: ({ requests, page }) => {
    const fonts = requests.filter(
      (r) =>
        r.type.startsWith("font/") ||
        r.type.startsWith("application/font") ||
        FONT_EXT.test(r.url.pathname)
    );
    const total = fonts.reduce((s, r) => s + r.transferSize, 0);
    let detail = `${fonts.length} police(s) téléchargée(s) (${Math.round(
      total / 1000
    )} ko)`;
    if (page && page.families.length > 0) {
      detail += ` : ${page.families.join(", ")}`;
    }
    const compliance =
      fonts.length === 0
        ? "A"
        : fonts.length <= 2 && total < MAX_B_SIZE
        ? "B"
        : "C";
    return { compliance, detail, offenders: fonts.map((r) => r.url.href) };
  },
};
