import { createContext, JSX, useContext } from "solid-js";
import { ImageEstimator } from "../domain/models/image-estimator";

const ImageEstimatorContext = createContext<ImageEstimator>();

/** Provides the app-wide `ImageEstimator` (created once by `getImageEstimator()` in `src/app/index.tsx`). */
export function ImageEstimatorProvider(props: {
  estimator: ImageEstimator;
  children: JSX.Element;
}) {
  return (
    // eslint-disable-next-line solid/reactivity -- created once, never replaced
    <ImageEstimatorContext.Provider value={props.estimator}>
      {props.children}
    </ImageEstimatorContext.Provider>
  );
}

export function useImageEstimator(): ImageEstimator {
  const estimator = useContext(ImageEstimatorContext);
  if (estimator == null) {
    throw new Error("useImageEstimator must be used inside <ImageEstimatorProvider>");
  }
  return estimator;
}
