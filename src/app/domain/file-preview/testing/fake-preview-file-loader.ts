import {
  PreviewFileLoader,
  PreviewFileResult,
  PreviewFontInfo,
  PreviewImageInfo,
  PreviewTextInfo,
} from "../../models/file-preview";
import { Deferred, deferred } from "../../image-comparison/testing/fake-variant-generator";

export { deferred, type Deferred };

/** A loaded image of `byteLength` bytes (test helper). */
export function loadedImage(
  byteLength: number,
  info: Partial<PreviewImageInfo> = {}
): PreviewFileResult<PreviewImageInfo> {
  return {
    status: "loaded",
    bytes: new Uint8Array(byteLength),
    info: {
      format: "jpeg",
      animated: false,
      vector: false,
      width: 1200,
      height: 800,
      byteLength,
      mimeType: "image/jpeg",
      ...info,
    },
  };
}

/** A loaded font of `byteLength` bytes (test helper). */
export function loadedFont(
  byteLength: number,
  info: Partial<PreviewFontInfo> = {}
): PreviewFileResult<PreviewFontInfo> {
  return {
    status: "loaded",
    bytes: new Uint8Array(byteLength),
    info: { format: "woff2", byteLength, mimeType: "font/woff2", ...info },
  };
}

/** A loaded text file: `text` encoded as UTF-8, decoded with "utf-8" by default (test helper). */
export function loadedText(text: string, info: Partial<PreviewTextInfo> = {}): PreviewFileResult<PreviewTextInfo> {
  const bytes = new TextEncoder().encode(text);
  return {
    status: "loaded",
    bytes,
    info: { byteLength: bytes.length, mimeType: "text/css", charset: "utf-8", ...info },
  };
}

/**
 * Hand-written fake loader: every call records its arguments and waits for the test to settle its
 * deferred (`images[i].resolve(...)`, `fonts[i].resolve(...)`, `texts[i].resolve(...)`).
 */
export class FakePreviewFileLoader implements PreviewFileLoader {
  readonly images: Array<{ url: string; declaredType: string } & Deferred<PreviewFileResult<PreviewImageInfo>>> = [];
  readonly fonts: Array<{ url: string; declaredType: string } & Deferred<PreviewFileResult<PreviewFontInfo>>> = [];

  readonly texts: Array<
    { url: string; declaredType: string; charset?: string } & Deferred<PreviewFileResult<PreviewTextInfo>>
  > = [];

  loadImage(url: string, declaredType: string): Promise<PreviewFileResult<PreviewImageInfo>> {
    const d = deferred<PreviewFileResult<PreviewImageInfo>>();
    this.images.push({ url, declaredType, ...d });
    return d.promise;
  }

  loadFont(url: string, declaredType: string): Promise<PreviewFileResult<PreviewFontInfo>> {
    const d = deferred<PreviewFileResult<PreviewFontInfo>>();
    this.fonts.push({ url, declaredType, ...d });
    return d.promise;
  }

  loadText(url: string, declaredType: string, charset?: string): Promise<PreviewFileResult<PreviewTextInfo>> {
    const d = deferred<PreviewFileResult<PreviewTextInfo>>();
    this.texts.push({ url, declaredType, ...(charset !== undefined ? { charset } : {}), ...d });
    return d.promise;
  }
}

/** Lets pending promise callbacks run. */
export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
