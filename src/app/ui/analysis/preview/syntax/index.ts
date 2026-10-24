/**
 * US-020: entry point of the tokenizers (ARCH-DECISION-025). It is the only module the text body
 * loads, with a dynamic `import()`, so Vite emits the tokenizers in a separate chunk. No other
 * non-test module may import it statically.
 */
import { createCssHighlighter } from "./css";
import { createJavaScriptHighlighter } from "./javascript";
import { createJsonHighlighter } from "./json";
import { createMarkupHighlighter } from "./markup";
import type { CreateLineHighlighter, LineHighlighter } from "./syntax-types";

/** Never colours anything: used for a language this build does not know. */
function plainHighlighter(): LineHighlighter {
  return { line: (text) => (text.length > 0 ? [{ text }] : []) };
}

/** A new, independent highlighter (own state) for `language`. */
export const createLineHighlighter: CreateLineHighlighter = (language) => {
  switch (language) {
    case "javascript":
      return createJavaScriptHighlighter();
    case "json":
      return createJsonHighlighter();
    case "css":
      return createCssHighlighter();
    case "markup":
      return createMarkupHighlighter();
    default:
      return plainHighlighter();
  }
};
