/**
 * Minification heuristic (US-010, ARCH-DECISION-018). Pure and streaming.
 *
 * Removable characters are comments (except licence, `@license`, `@preserve` and source-map
 * comments) and whitespace beyond what separates tokens. The result never depends on how the
 * text is split into chunks: every lookahead is carried in the scanner state.
 *
 * It is an estimate, not a parser. Strings (JS, CSS) are skipped so that `"http://…"` is not a
 * comment; regex literals, `<pre>` blocks and `${}` nesting are not parsed (the 5 % tolerance
 * absorbs them).
 */
import { TextFileType } from "../models/text-content";

export interface MinificationResult {
  characters: number;
  removableCharacters: number;
}

export interface MinificationScanner {
  feed(chunk: string): void;
  /** Can be called at any time; does not alter the scan. */
  result(): MinificationResult;
}

const CODE = 0;
const SINGLE_QUOTED = 1;
const DOUBLE_QUOTED = 2;
const TEMPLATE = 3;
const BLOCK_COMMENT = 4;
const LINE_COMMENT = 5;
const HTML_COMMENT = 6;

const LICENSE = "@license";
const PRESERVE = "@preserve";
const HTML_OPENER = "<!--";
const SOURCE_MAP_COMMENT = /^[#@]\s*sourceMappingURL=/;
/** Enough of the comment start to recognise `!` and `# sourceMappingURL=`. */
const HEAD_LENGTH = 32;

export function createMinificationScanner(type: TextFileType): MinificationScanner {
  const markup = type === "HTML" || type === "SVG";
  const lineComments = type === "JS";
  const templates = type === "JS";

  let state = CODE;
  let characters = 0;
  let removable = 0;

  // Whitespace run in progress.
  let wsLength = 0;
  let wsBreak = false;
  // A "/" was just read in code and may open a comment.
  let slash = false;
  // Number of characters of "<!--" already matched in markup text.
  let htmlMatched = 0;
  // Backslash seen inside a string.
  let escaped = false;

  // Comment in progress.
  let commentLength = 0;
  let commentHead = "";
  let commentKept = false;
  let licenseMatched = 0;
  let preserveMatched = 0;
  let star = false;
  let dashes = 0;

  const startComment = (kind: number, openerLength: number) => {
    state = kind;
    commentLength = openerLength;
    commentHead = "";
    commentKept = false;
    licenseMatched = 0;
    preserveMatched = 0;
    star = false;
    dashes = 0;
  };

  const isKept = () => {
    if (commentKept) return true;
    if (state === HTML_COMMENT) return false;
    if (state === BLOCK_COMMENT && commentHead.charCodeAt(0) === 33 /* ! */) return true;
    return SOURCE_MAP_COMMENT.test(commentHead);
  };

  const endComment = () => {
    if (!isKept()) removable += commentLength;
    state = CODE;
  };

  const flushWhitespace = () => {
    if (wsLength > 0) {
      removable += wsBreak ? wsLength : wsLength - 1;
      wsLength = 0;
      wsBreak = false;
    }
  };

  const feed = (chunk: string) => {
    const length = chunk.length;
    characters += length;
    for (let i = 0; i < length; i++) {
      const c = chunk.charCodeAt(i);
      let again: boolean;
      do {
        again = false;
        switch (state) {
          case CODE: {
            if (slash) {
              slash = false;
              if (c === 42) {
                startComment(BLOCK_COMMENT, 2);
                break;
              }
              if (lineComments && c === 47) {
                startComment(LINE_COMMENT, 2);
                break;
              }
            }
            // space, tab, line feed, form feed, carriage return
            if (c === 32 || c === 10 || c === 9 || c === 13 || c === 12) {
              wsLength++;
              if (c === 10 || c === 13) wsBreak = true;
              htmlMatched = 0;
              break;
            }
            flushWhitespace();
            if (markup) {
              if (c === 60) {
                htmlMatched = 1;
              } else if (htmlMatched > 0) {
                if (c === HTML_OPENER.charCodeAt(htmlMatched)) {
                  htmlMatched++;
                  if (htmlMatched === 4) {
                    htmlMatched = 0;
                    startComment(HTML_COMMENT, 4);
                  }
                } else {
                  htmlMatched = 0;
                }
              }
            } else if (c === 47) {
              slash = true;
            } else if (c === 39) {
              state = SINGLE_QUOTED;
              escaped = false;
            } else if (c === 34) {
              state = DOUBLE_QUOTED;
              escaped = false;
            } else if (templates && c === 96) {
              state = TEMPLATE;
              escaped = false;
            }
            break;
          }
          case SINGLE_QUOTED:
          case DOUBLE_QUOTED:
          case TEMPLATE: {
            if (escaped) {
              escaped = false;
            } else if (c === 92) {
              escaped = true;
            } else if (
              (state === SINGLE_QUOTED && c === 39) ||
              (state === DOUBLE_QUOTED && c === 34) ||
              (state === TEMPLATE && c === 96)
            ) {
              state = CODE;
            } else if (state !== TEMPLATE && (c === 10 || c === 13)) {
              // Unterminated string: the line break ends it and counts as whitespace.
              state = CODE;
              again = true;
            }
            break;
          }
          case BLOCK_COMMENT:
          case LINE_COMMENT:
          case HTML_COMMENT: {
            if (state === LINE_COMMENT && (c === 10 || c === 13)) {
              endComment();
              again = true;
              break;
            }
            commentLength++;
            if (commentHead.length < HEAD_LENGTH) commentHead += String.fromCharCode(c);
            if (!commentKept) {
              licenseMatched = c === LICENSE.charCodeAt(licenseMatched) ? licenseMatched + 1 : c === 64 ? 1 : 0;
              preserveMatched = c === PRESERVE.charCodeAt(preserveMatched) ? preserveMatched + 1 : c === 64 ? 1 : 0;
              if (licenseMatched === LICENSE.length || preserveMatched === PRESERVE.length) commentKept = true;
            }
            if (state === BLOCK_COMMENT) {
              if (c === 47 && star) endComment();
              else star = c === 42;
            } else if (state === HTML_COMMENT) {
              if (c === 45) dashes++;
              else if (c === 62 && dashes >= 2) endComment();
              else dashes = 0;
            }
            break;
          }
        }
      } while (again);
    }
  };

  return {
    feed,
    result() {
      let total = removable;
      if (wsLength > 0) total += wsBreak ? wsLength : wsLength - 1;
      if (state >= BLOCK_COMMENT && !isKept()) total += commentLength;
      return { characters, removableCharacters: total };
    },
  };
}

/** One-shot measure of a whole text. */
export function measureMinification(text: string, type: TextFileType): MinificationResult {
  const scanner = createMinificationScanner(type);
  scanner.feed(text);
  return scanner.result();
}
