export function getUrl(href: string, params: { [key: string]: any }): string {
  const urlSearchParms = new URLSearchParams();
  Object.keys(params).forEach((key) => {
    urlSearchParms.set(key, String(params[key]));
  });
  const search = urlSearchParms.toString();

  return search.trim().length > 0 ? `${href}?${search}` : href;
}

export function isNotOnSamePage(url1: string, url2: string) {
  try {
    const parsedUrl1 = new URL(url1);
    const parsedUrl2 = new URL(url2);

    // We do not take into account navigations towards specific anchors
    return (
      parsedUrl1.origin !== parsedUrl2.origin ||
      parsedUrl1.pathname !== parsedUrl2.pathname ||
      parsedUrl1.search !== parsedUrl2.search
    );
  } catch (err) {
    return false;
  }
}
