/**
 * Minification heuristic (US-021, ARCH-DECISION-026; replaces the US-010 parser). Pure and streaming.
 *
 * Removable characters come from the line structure only: every line break, the indentation of
 * each line and its trailing whitespace. There is no notion of string, comment or language, so
 * nothing can drift on minified code: comments and whitespace between two other characters of a
 * line are not counted. The result never depends on how the text is split into chunks.
 *
 * It is an estimate: whitespace inside multi-line template literals or `<pre>` blocks is counted.
 */
export interface MinificationResult {
  characters: number;
  removableCharacters: number;
}

export interface MinificationScanner {
  feed(chunk: string): void;
  /** Can be called at any time; does not alter the scan. */
  result(): MinificationResult;
}

export function createMinificationScanner(): MinificationScanner {
  let characters = 0;
  let removable = 0;
  // No character other than whitespace yet on the current line.
  let atLineStart = true;
  // Whitespace characters since the last other character (or the line start).
  let pendingRun = 0;

  const feed = (chunk: string) => {
    const length = chunk.length;
    characters += length;
    for (let i = 0; i < length; i++) {
      const c = chunk.charCodeAt(i);
      if (c === 32 || c === 9 || c === 12) {
        // space, tab, form feed
        pendingRun++;
      } else if (c === 10 || c === 13) {
        // A line break ends the line: its indentation or trailing whitespace, and itself.
        removable += pendingRun + 1;
        pendingRun = 0;
        atLineStart = true;
      } else {
        if (atLineStart) {
          removable += pendingRun;
          atLineStart = false;
        }
        pendingRun = 0;
      }
    }
  };

  return {
    feed,
    result() {
      // A run at the end of the text is trailing (or a whole blank line's indentation).
      return { characters, removableCharacters: removable + pendingRun };
    },
  };
}

/** One-shot measure of a whole text. */
export function measureMinification(text: string): MinificationResult {
  const scanner = createMinificationScanner();
  scanner.feed(text);
  return scanner.result();
}
