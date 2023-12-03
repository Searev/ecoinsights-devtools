export function getUrl(href: string, params: { [key: string]: any }): string {
  const urlSearchParms = new URLSearchParams();
  Object.keys(params).forEach((key) => {
    urlSearchParms.set(key, String(params[key]));
  });
  const search = urlSearchParms.toString();

  return search.trim().length > 0 ? `${href}?${search}` : href;
}

export function isNotOnSamePage(url1: string, url2: string) {
  const parsedUrl1 = new URL(url1);
  const parsedUrl2 = new URL(url2);

  // On ignore les navigations vers des ancres particulières.
  return (
    parsedUrl1.origin !== parsedUrl2.origin ||
    parsedUrl1.pathname !== parsedUrl2.pathname ||
    parsedUrl1.search !== parsedUrl2.search
  );
}
