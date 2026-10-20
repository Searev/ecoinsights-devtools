import {
  PreviewFileLoader,
  PreviewFileResult,
  PreviewFontInfo,
  PreviewImageInfo,
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
}
