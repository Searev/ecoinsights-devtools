/** Pure layout maths of the image preview (US-015); reuses the comparison maths (US-005). */
import { ImagePreviewSubject, PreviewImageInfo } from "../../../domain/models/file-preview";
import { DisplayMode, Size, nativeCssSize, pageBox } from "../comparison/comparison-layout";

/** True when the box is defined with both sides positive (missing box counts as not displayed). */
export function isDisplayedBox(box?: Size): box is Size {
  return box !== undefined && box.width > 0 && box.height > 0;
}

export function initialImageMode(subject: Pick<ImagePreviewSubject, "display">): DisplayMode {
  return isDisplayedBox(subject.display) ? "page" : "native";
}

function naturalSize(info: PreviewImageInfo, decoded?: Size): Size | undefined {
  if (info.width !== undefined && info.height !== undefined && info.width > 0 && info.height > 0) {
    return { width: info.width, height: info.height };
  }
  if (!info.vector && decoded !== undefined && decoded.width > 0 && decoded.height > 0) return decoded;
  return undefined;
}

/** CSS size of the `<img>`; undefined leaves the browser's own size. */
export function imagePreviewSize(input: {
  mode: DisplayMode;
  display?: Size;
  info: PreviewImageInfo;
  decoded?: Size;
  areaWidth: number;
  devicePixelRatio: number;
}): Size | undefined {
  const { mode, display, info, decoded, areaWidth, devicePixelRatio } = input;
  if (mode === "page" && isDisplayedBox(display)) return pageBox(display, areaWidth);
  const natural = naturalSize(info, decoded);
  if (natural !== undefined) return nativeCssSize(natural, devicePixelRatio);
  if (info.vector && isDisplayedBox(display)) return { width: display.width, height: display.height };
  return undefined;
}
