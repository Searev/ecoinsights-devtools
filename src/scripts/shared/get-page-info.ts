import { PageInfos } from "../../app/domain/models/page-infos";

export async function getPageInfo(tabId: number): Promise<PageInfos> {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [],
    func: () => ({
      title: document.title,
      url: window.location.href,
      domSize: document.querySelectorAll("*:not(svg *)").length,
    }),
  });

  return res.result;
}
