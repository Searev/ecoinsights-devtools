import { createContext, JSX, useContext } from "solid-js";
import { ContentAnalyser } from "../domain/models/content-analyser";

const ContentAnalyserContext = createContext<ContentAnalyser>();

/** Provides the app-wide `ContentAnalyser` (created once by `getContentAnalyser()` in `src/app/index.tsx`). */
export function ContentAnalyserProvider(props: {
  analyser: ContentAnalyser;
  children: JSX.Element;
}) {
  return (
    // eslint-disable-next-line solid/reactivity -- created once, never replaced
    <ContentAnalyserContext.Provider value={props.analyser}>
      {props.children}
    </ContentAnalyserContext.Provider>
  );
}

export function useContentAnalyser(): ContentAnalyser {
  const analyser = useContext(ContentAnalyserContext);
  if (analyser == null) {
    throw new Error("useContentAnalyser must be used inside <ContentAnalyserProvider>");
  }
  return analyser;
}
