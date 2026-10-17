export async function getPrintStylesheetNumber(tabId: number): Promise<number> {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [],
    func: () =>
      document.querySelectorAll(
        "link[rel=stylesheet][media~=print], style[media~=print]"
      ).length,
  });

  return res.result;
}
