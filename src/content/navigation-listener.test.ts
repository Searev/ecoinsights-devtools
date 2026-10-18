// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listenToNavigationIntents } from "./navigation-listener";

function setup(html: string) {
  document.body.innerHTML = html;
  window.history.replaceState({}, "", "/current");
  const intents: any[] = [];
  const closeable = listenToNavigationIntents(document, (e) => intents.push(e));
  return { intents, closeable };
}

function click(el: Element, init: MouseEventInit = {}) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
}

describe("listenToNavigationIntents", () => {
  let cleanup: { close(): void } | undefined;
  beforeEach(() => {
    cleanup = undefined;
    // jsdom logs "navigation not implemented" when a clicked link/onclick navigates.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => cleanup?.close());

  it("reports a link to another path", () => {
    const { intents, closeable } = setup('<a id="l" href="/other">x</a>');
    cleanup = closeable;
    click(document.getElementById("l")!);
    expect(intents).toEqual([{ kind: "link-clicked", url: `${location.origin}/other` }]);
  });

  it("ignores a same-path anchor link", () => {
    const { intents, closeable } = setup('<a id="l" href="/current#top">x</a>');
    cleanup = closeable;
    click(document.getElementById("l")!);
    expect(intents).toEqual([]);
  });

  it("ignores target=_blank links", () => {
    const { intents, closeable } = setup('<a id="l" href="/other" target="_blank">x</a>');
    cleanup = closeable;
    click(document.getElementById("l")!);
    expect(intents).toEqual([]);
  });

  it("ignores ctrl-click and meta-click", () => {
    const { intents, closeable } = setup('<a id="l" href="/other">x</a>');
    cleanup = closeable;
    click(document.getElementById("l")!, { ctrlKey: true });
    click(document.getElementById("l")!, { metaKey: true });
    expect(intents).toEqual([]);
  });

  it("reports a submit button inside a form with form.action", () => {
    const { intents, closeable } = setup(
      '<form action="/search"><button id="b" type="submit">go</button></form>'
    );
    cleanup = closeable;
    click(document.getElementById("b")!);
    expect(intents).toEqual([{ kind: "form-submitted", url: `${location.origin}/search` }]);
  });

  it("does not report a non-submit button in a form", () => {
    const { intents, closeable } = setup(
      '<form action="/search"><button id="b" type="button">go</button></form>'
    );
    cleanup = closeable;
    click(document.getElementById("b")!);
    expect(intents).toEqual([]);
  });

  it("reports onclick=window.location.href buttons through the callback", () => {
    const { intents, closeable } = setup(
      `<button id="b" type="button" onclick="window.location.href='/next'">go</button>`
    );
    cleanup = closeable;
    click(document.getElementById("b")!);
    expect(intents).toEqual([{ kind: "link-clicked", url: `${location.origin}/next` }]);
  });

  it("stops listening after close()", () => {
    const { intents, closeable } = setup('<a id="l" href="/other">x</a>');
    closeable.close();
    click(document.getElementById("l")!);
    expect(intents).toEqual([]);
  });
});
