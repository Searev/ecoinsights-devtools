/** Pure layout maths of the comparison dialog (US-005). */
import { ComparisonSubject } from "../../../domain/models/image-variants";

export interface Size {
  width: number;
  height: number;
}

export type DisplayMode = "page" | "native";

/** True when the image had a non-empty CSS box on the page (missing box counts as not displayed, L3). */
export function isDisplayed(subject: ComparisonSubject): boolean {
  return subject.display !== undefined && subject.display.width > 0 && subject.display.height > 0;
}

export function initialMode(subject: ComparisonSubject): DisplayMode {
  return isDisplayed(subject) ? "page" : "native";
}

/** The page display box, scaled down proportionally when wider than `maxWidth`. */
export function pageBox(display: Size, maxWidth: number): Size {
  if (maxWidth <= 0 || display.width <= maxWidth) {
    return { width: display.width, height: display.height };
  }
  const ratio = maxWidth / display.width;
  return { width: maxWidth, height: Math.max(1, Math.round(display.height * ratio)) };
}

/** 1 image pixel = 1 physical pixel: natural size ÷ devicePixelRatio. */
export function nativeCssSize(natural: Size, devicePixelRatio: number): Size {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  return { width: natural.width / dpr, height: natural.height / dpr };
}
