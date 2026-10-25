export type RichTextSegment = { text: string; bold: boolean };
export type RichTextLine = RichTextSegment[];

const MARKER = "**";

function push(line: RichTextLine, text: string, bold: boolean): void {
  if (text === "") return;
  const last = line[line.length - 1];
  if (last && last.bold === bold) last.text += text;
  else line.push({ text, bold });
}

function parseLine(source: string): RichTextLine {
  const line: RichTextLine = [];
  let i = 0;
  while (i < source.length) {
    const open = source.indexOf(MARKER, i);
    if (open === -1) {
      push(line, source.slice(i), false);
      break;
    }
    const close = source.indexOf(MARKER, open + MARKER.length);
    if (close === -1) {
      push(line, source.slice(i), false);
      break;
    }
    if (close === open + MARKER.length) {
      // "****": empty bold, kept literal.
      push(line, source.slice(i, close), false);
      i = close;
      continue;
    }
    push(line, source.slice(i, open), false);
    push(line, source.slice(open + MARKER.length, close), true);
    i = close + MARKER.length;
  }
  return line;
}

/**
 * Parses descriptions: `\n` separates lines and `**x**` is bold. Nothing else is
 * markup, and HTML is never interpreted (the result is rendered as text nodes).
 */
export function parseRichText(text: string): RichTextLine[] {
  return text.replace(/\r\n/g, "\n").split("\n").map(parseLine);
}
