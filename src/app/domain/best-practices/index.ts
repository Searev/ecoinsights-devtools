import { dontResizeImagesRule } from "./rules/dont-resize-images.rule";
import { optimisedFormatsRule } from "./rules/optimised-formats.rule";
import { printStylesheetRule } from "./rules/print-stylesheet.rule";
import { standardFontsRule } from "./rules/standard-fonts.rule";
import { BestPracticeRule } from "./rule";

export const RULES: readonly BestPracticeRule<any>[] = [
  printStylesheetRule,
  dontResizeImagesRule,
  optimisedFormatsRule,
  standardFontsRule,
] as const;
