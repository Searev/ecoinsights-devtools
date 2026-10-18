import { createContext, JSX, useContext } from "solid-js";
import { Browser } from "../domain/models/browser";

const BrowserContext = createContext<Browser>();

export function BrowserProvider(props: {
  browser: Browser;
  children: JSX.Element;
}): JSX.Element {
  return (
    <BrowserContext.Provider value={props.browser}>
      {props.children}
    </BrowserContext.Provider>
  );
}

export function useBrowser(): Browser {
  const browser = useContext(BrowserContext);
  if (!browser) {
    throw new Error("useBrowser must be used inside <BrowserProvider>");
  }
  return browser;
}
