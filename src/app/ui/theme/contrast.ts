/**
 * WCAG 2.x relative luminance and contrast ratio (moved from `syntax-palette.ts` for US-030, which
 * re-exports `contrastRatio`). No imports: `tailwind.config.ts` loads the theme modules.
 */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  let digits = hex.replace("#", "");
  if (digits.length === 3) digits = digits.replace(/./g, (c) => c + c);
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(digits.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two `#rrggbb` (or `#rgb`) colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
