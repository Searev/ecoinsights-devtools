import {
  ResizedImage,
  getResizedImages,
} from "../../../scripts/shared/rules/get-resized-images";
import { BestPracticeCompliance, BestPractice } from "../models/best-practice";
import { FrameBestPracticeAnalyzer } from "./best-practice-analyzer";

export default class DontResizeImagesInBrowserAnalyzer
  implements FrameBestPracticeAnalyzer
{
  private _id = "DontResizeImagesInBrowser";
  private _complianceLevel: BestPracticeCompliance = "A";
  private _resizedImages: ResizedImage[] = [];

  get bestPractice(): BestPractice {
    return {
      id: this._id,
      name: "Ne pas redimensionner les images dans le navigateur",
      detail:
        this._resizedImages.length > 0
          ? `Les images suivantes ont été redimensionnées dans le navigateur \n ${this._resizedImages
              .map(
                (el) =>
                  `- ${el.src}, retaillée en ${el.clientHeight}x${el.clientWidth} au lieu de : ${el.naturalHeight}x${el.naturalWidth})`
              )
              .join("\n")}`
          : "Aucune image n'a été redimensionnée dans le navigateur",
      compliance: this._complianceLevel,
    };
  }

  async analyzeFrame(tabId: number): Promise<void> {
    const images = await getResizedImages(tabId);
    const analyzedImages = images.map((img) => ({
      src: img.src.split("/").splice(-1)[0],
      clientWidth: img.clientWidth,
      clientHeight: img.clientHeight,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    }));
    this._resizedImages = analyzedImages;
    this._complianceLevel = this._resizedImages?.length > 0 ? "C" : "A";
  }

  clear(): void {
    this._resizedImages = [];
  }
}
