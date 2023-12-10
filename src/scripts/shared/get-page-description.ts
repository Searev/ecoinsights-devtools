import { PageDescription } from "../../app/domain/models/page-description";

export async function getPageDescription(
  tabId: number
): Promise<PageDescription> {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [],
    func: () => ({
      name: document.title,
      description:
        (document.querySelector('meta[name="description"]') as HTMLMetaElement)
          ?.content ?? "",
      url: window.location.origin,
    }),
  });

  return res.result;
}
