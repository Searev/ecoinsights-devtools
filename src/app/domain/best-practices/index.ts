import { dontResizeImagesRule } from "./rules/dont-resize-images.rule";
import { optimisedFormatsRule } from "./rules/optimised-formats.rule";
import { printStylesheetRule } from "./rules/print-stylesheet.rule";
import { standardFontsRule } from "./rules/standard-fonts.rule";
import { provideTextAlternativesRule } from "./rules/provide-text-alternatives.rule";
import { useLazyLoadingRule } from "./rules/use-lazy-loading.rule";
import { compressTextFilesRule } from "./rules/compress-text-files.rule";
import { addCacheHeadersRule } from "./rules/add-cache-headers.rule";
import { minifyTextFilesRule } from "./rules/minify-text-files.rule";
import { limitDomainsRule } from "./rules/limit-domains.rule";
import { preferHttp2Rule } from "./rules/prefer-http2.rule";
import { limitGifsRule } from "./rules/limit-gifs.rule";
import { avoidMediaAutoplayRule } from "./rules/avoid-media-autoplay.rule";
import { externalizeCssJsRule } from "./rules/externalize-css-js.rule";
import { limitRequestsRule } from "./rules/limit-requests.rule";
import { limitCssFilesRule } from "./rules/limit-css-files.rule";
import { limitCanvasRule } from "./rules/limit-canvas.rule";
import { BestPracticeRule } from "./rule";

export const RULES: readonly BestPracticeRule<any>[] = [
  printStylesheetRule,
  dontResizeImagesRule,
  optimisedFormatsRule,
  standardFontsRule,
  // EPIC-BP2 (US-006 to US-014)
  provideTextAlternativesRule,
  useLazyLoadingRule,
  compressTextFilesRule,
  addCacheHeadersRule,
  minifyTextFilesRule,
  limitDomainsRule,
  preferHttp2Rule,
  limitGifsRule,
  avoidMediaAutoplayRule,
  // EPIC-BP3 (US-024 to US-027)
  externalizeCssJsRule,
  limitRequestsRule,
  limitCssFilesRule,
  limitCanvasRule,
] as const;
