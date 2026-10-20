/** DOM-free helpers of the media player (US-016, ARCH-DECISION-023). */
import { DisplayMode, Size, nativeCssSize, pageBox } from "../comparison/comparison-layout";
import { MediaMetadata } from "./media-format";

export interface MediaElementLike {
  pause(): void;
  removeAttribute(name: string): void;
  load(): void;
}

/** Stops playback and cancels the download: pause, drop the source, reload. Never throws. */
export function releaseMedia(el: MediaElementLike): void {
  try {
    el.pause();
  } catch {
    /* ignore */
  }
  try {
    el.removeAttribute("src");
  } catch {
    /* ignore */
  }
  try {
    el.load();
  } catch {
    /* ignore */
  }
}

/** CSS size of the video, or undefined to let the browser decide. */
export function mediaDisplaySize(input: {
  mode: DisplayMode;
  display?: Size;
  metadata?: MediaMetadata;
  areaWidth: number;
  devicePixelRatio: number;
}): Size | undefined {
  const { mode, display, metadata } = input;
  if (mode === "page") {
    return display !== undefined && display.width > 0 && display.height > 0
      ? pageBox(display, input.areaWidth)
      : undefined;
  }
  if (metadata?.width !== undefined && metadata.height !== undefined && metadata.width > 0 && metadata.height > 0) {
    return nativeCssSize({ width: metadata.width, height: metadata.height }, input.devicePixelRatio);
  }
  return undefined;
}
