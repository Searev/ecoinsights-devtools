export type ResizedImage = {
  src: string;
  clientWidth: number;
  clientHeight: number;
  naturalWidth: number;
  naturalHeight: number;
};

export async function getResizedImages(tabId: number): Promise<ResizedImage[]> {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [],
    func: () =>
      Array.from(document.querySelectorAll("img")).map((img) => ({
        src: img.src,
        clientWidth: img.clientWidth,
        clientHeight: img.clientHeight,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      })),
  });

  return res.result.filter((el) => {
    // exclude svg
    if (el.src.includes("svg")) {
      return false;
    }

    // difference of 1 pixel is not relevant
    if (el.naturalWidth - el.clientWidth < 2) return false;
    if (el.naturalHeight - el.clientHeight < 2) return false;

    // If picture is 0x0 it meens it's not visible on the ui, see imageDownloadedNotDisplayed
    if (el.clientWidth === 0) return false;

    return true;
  });
}
