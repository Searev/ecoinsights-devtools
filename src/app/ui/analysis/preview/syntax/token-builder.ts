/**
 * Shared plumbing of the tokenizers (ARCH-DECISION-025): builds the token list of one line, merging
 * adjacent tokens of the same kind, and a few character-class helpers. Pure, no DOM.
 */
import type { LineToken, TokenKind } from "./syntax-types";

export class TokenBuilder {
  private readonly list: LineToken[] = [];
  private held = "";

  /** Appends `text` (ignored when empty); merges it into the previous token of the same kind. */
  add(text: string, kind?: TokenKind): void {
    if (text.length === 0) return;
    const last = this.list[this.list.length - 1];
    if (this.held.length > 0) {
      if (last && kind !== undefined && last.kind === kind) {
        last.text += this.held;
      } else {
        this.push(this.held, undefined);
      }
      this.held = "";
    }
    const tail = this.list[this.list.length - 1];
    if (tail && tail.kind === kind) tail.text += text;
    else this.push(text, kind);
  }

  /**
   * Appends whitespace that joins the neighbouring tokens when both have the same kind (so that
   * `a b` stays one `value` token), and is plain otherwise.
   */
  space(text: string): void {
    this.held += text;
  }

  /** The finished tokens (also flushes held whitespace). */
  finish(): LineToken[] {
    if (this.held.length > 0) {
      this.push(this.held, undefined);
      this.held = "";
    }
    return this.list;
  }

  private push(text: string, kind: TokenKind | undefined): void {
    this.list.push(kind === undefined ? { text } : { text, kind });
  }
}

export function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

export function isAsciiLetter(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

export function isHexDigit(c: number): boolean {
  return isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}

/** Space, tab, and the other ASCII whitespace of a line. */
export function isSpace(c: number): boolean {
  return c === 32 || c === 9 || c === 12 || c === 11 || c === 160;
}

/** Lower-cases an ASCII letter code. */
export function lowerAscii(c: number): number {
  return c >= 65 && c <= 90 ? c + 32 : c;
}
