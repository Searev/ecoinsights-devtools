/**
 * US-020 / ARCH-DECISION-025: renders the lines of a text file as DOM rows, without freezing the
 * panel. A plain pass appends the rows in time slices, then a colouring pass applies the tokens of
 * the lazily-loaded highlighter. Text only enters the DOM through `createTextNode` / `textContent`
 * (never as markup), so a hostile file cannot create an element (checked by `text-safety.test.ts`).
 */
import { tokenClass, type LineHighlighter } from "./syntax/syntax-types";

/** Default time budget of one slice, in milliseconds. */
export const TEXT_VIEW_SLICE_MS = 12;

export interface TextViewOptions {
  /** Loads the highlighter; undefined, a rejection or an undefined result: plain text only. */
  highlighter?: () => Promise<LineHighlighter | undefined>;
  /** Runs a task later (the body passes `(task) => setTimeout(task, 0)`). */
  schedule: (task: () => void) => void;
  /** Monotonic clock in ms (the body passes `performance.now`). */
  now: () => number;
  /** Time budget per slice; default `TEXT_VIEW_SLICE_MS`. */
  sliceMs?: number;
}

export interface TextView {
  cancel(): void;
  /** Resolves when the rows and the colours are done, colouring failed, or the view was cancelled. Never rejects. */
  readonly settled: Promise<void>;
}

export function renderTextView(
  container: HTMLElement,
  lines: readonly string[],
  options: TextViewOptions,
): TextView {
  const doc = container.ownerDocument;
  const sliceMs = options.sliceMs ?? TEXT_VIEW_SLICE_MS;
  const codeSpans: HTMLElement[] = [];
  let cancelled = false;
  let finished = false;
  let resolveSettled: () => void = () => undefined;
  const settled = new Promise<void>((resolve) => {
    resolveSettled = resolve;
  });
  const finish = () => {
    finished = true;
    resolveSettled();
  };

  container.replaceChildren();

  let highlighterPromise: Promise<LineHighlighter | undefined> | undefined;
  if (options.highlighter) {
    try {
      highlighterPromise = Promise.resolve(options.highlighter()).catch(() => undefined);
    } catch {
      highlighterPromise = Promise.resolve(undefined);
    }
  }

  const createRow = (text: string, index: number): DocumentFragment | HTMLElement => {
    const row = doc.createElement("div");
    row.className = "text-row";
    const gutter = doc.createElement("span");
    gutter.className = "text-gutter";
    gutter.setAttribute("aria-hidden", "true");
    gutter.setAttribute("data-line", String(index + 1));
    const code = doc.createElement("span");
    code.className = "text-code";
    if (text.length > 0) code.appendChild(doc.createTextNode(text));
    row.append(gutter, code);
    codeSpans.push(code);
    return row;
  };

  const colour = (highlighter: LineHighlighter) => {
    let next = 0;
    const slice = () => {
      if (cancelled || finished) return;
      const start = options.now();
      do {
        const text = lines[next];
        let tokens;
        try {
          tokens = highlighter.line(text);
        } catch {
          finish();
          return;
        }
        if (!Array.isArray(tokens) || tokens.map((t) => t.text).join("") !== text) {
          finish();
          return;
        }
        if (tokens.some((t) => t.kind !== undefined)) {
          // A fragment, not `replaceChildren(...nodes)`: a long line may have more tokens than
          // the engine accepts as call arguments.
          const fragment = doc.createDocumentFragment();
          for (const t of tokens) {
            if (t.text.length === 0) continue;
            if (t.kind === undefined) {
              fragment.appendChild(doc.createTextNode(t.text));
            } else {
              const span = doc.createElement("span");
              span.className = tokenClass(t.kind);
              span.textContent = t.text;
              fragment.appendChild(span);
            }
          }
          codeSpans[next].replaceChildren(fragment);
        }
        next++;
      } while (next < lines.length && options.now() - start < sliceMs);
      if (next >= lines.length) finish();
      else options.schedule(slice);
    };
    options.schedule(slice);
  };

  const afterPlain = () => {
    if (!highlighterPromise || lines.length === 0) {
      finish();
      return;
    }
    void highlighterPromise.then((highlighter) => {
      if (cancelled) return;
      if (!highlighter) finish();
      else colour(highlighter);
    });
  };

  let appended = 0;
  const plainSlice = () => {
    if (cancelled) return;
    const start = options.now();
    const fragment = doc.createDocumentFragment();
    do {
      fragment.appendChild(createRow(lines[appended], appended));
      appended++;
    } while (appended < lines.length && options.now() - start < sliceMs);
    container.appendChild(fragment);
    if (appended < lines.length) options.schedule(plainSlice);
    else afterPlain();
  };

  if (lines.length === 0) afterPlain();
  else plainSlice();

  return {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      finish();
    },
    settled,
  };
}
