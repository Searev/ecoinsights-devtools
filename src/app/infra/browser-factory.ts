import { Browser } from "../domain/models/browser";
import { ExtensionBrowser } from "./extension-browser";
import { ImageEstimator } from "../domain/models/image-estimator";
import { ImageVariantGenerator } from "../domain/models/image-variants";
import { ContentAnalyser } from "../domain/models/content-analyser";
import { createDevtoolsContentAnalyser } from "./content-analyser/devtools-content-analyser";
import { FakeContentAnalyser } from "./content-analyser/fake-content-analyser";
import { createImageBytesSource } from "./image-estimator/image-bytes-source";
import { FakeImageEstimator } from "./image-estimator/fake-image-estimator";
import { WorkerImageEstimator } from "./image-estimator/worker-image-estimator";
import { WorkerLike } from "./image-codec/worker-protocol";
import { PreviewFileLoader } from "../domain/models/file-preview";
import { createPreviewFileLoader } from "./file-preview/preview-file-loader";
import { FakePreviewFileLoader } from "./file-preview/fake-preview-file-loader";
import { MockBrowser } from "./mock-browser";

const DEMO_INTERVAL_MS = 1000;

let _browser: Promise<Browser> | null = null;
let _imageEstimator: Promise<ImageEstimator & ImageVariantGenerator> | null = null;
let _contentAnalyser: Promise<ContentAnalyser> | null = null;
let _previewFileLoader: Promise<PreviewFileLoader> | null = null;

/**
 * MockBrowser for `npm run dev`. The demo timer lives here, not in the class:
 * the DOM grows and a request is emitted every second.
 */
export function createDemoMockBrowser(): MockBrowser {
  const browser = new MockBrowser();
  let domSize = 100;
  setInterval(() => {
    domSize += Math.ceil(10 * Math.random());
    browser.setPageInfo({
      title: "Mocked page",
      url: "https://www.example.org",
      domSize,
    });
    browser.emitNetworkRequest({
      method: "GET",
      url: new URL("https://developer.chrome.com/docs/extensions/mv3/manifest/"),
      code: 200,
      type: "text/html",
      responseSize: 140_360,
      transferSize: 33_030,
    });
  }, DEMO_INTERVAL_MS);
  return browser;
}

function create(): Browser {
  const extensionApi = (globalThis as any).chrome;
  if (extensionApi?.devtools?.inspectedWindow) {
    return new ExtensionBrowser({
      runtime: extensionApi.runtime,
      devtools: extensionApi.devtools,
    });
  }
  return createDemoMockBrowser();
}

export function getBrowser(): Promise<Browser> {
  if (_browser == null) {
    _browser = Promise.resolve().then(create);
  }
  return _browser;
}

async function createImageEstimator(): Promise<ImageEstimator & ImageVariantGenerator> {
  // Same instance as getBrowser(): it remembers the HAR entries whose bodies the estimator reads.
  const browser = await getBrowser();
  if (!(browser instanceof ExtensionBrowser)) return new FakeImageEstimator();
  // Loaded here (not statically) so that Node tests and `npm run dev` never need the worker bundle.
  const { default: CodecWorker } = await import("./image-codec/codec.worker?worker");
  return new WorkerImageEstimator({
    getBytes: createImageBytesSource({
      getDevtoolsContent: (url) => browser.getResourceContent(url),
      fetch: globalThis.fetch.bind(globalThis),
    }),
    createWorker: () => new CodecWorker() as unknown as WorkerLike,
  });
}

/** Memoised: `WorkerImageEstimator` in the extension, `FakeImageEstimator` otherwise. */
export function getImageEstimator(): Promise<ImageEstimator & ImageVariantGenerator> {
  if (_imageEstimator == null) {
    _imageEstimator = createImageEstimator();
  }
  return _imageEstimator;
}

async function createContentAnalyser(): Promise<ContentAnalyser> {
  // Same instance as getBrowser(): it remembers the HAR entries whose bodies are analysed.
  const browser = await getBrowser();
  if (!(browser instanceof ExtensionBrowser)) return new FakeContentAnalyser();
  // No fetch here by design: contents come only from what DevTools captured (US-010).
  return createDevtoolsContentAnalyser({
    getDevtoolsContent: (url) => browser.getResourceContent(url),
  });
}

/** Memoised: DevTools-content analyser in the extension, `FakeContentAnalyser` otherwise. */
export function getContentAnalyser(): Promise<ContentAnalyser> {
  if (_contentAnalyser == null) {
    _contentAnalyser = createContentAnalyser();
  }
  return _contentAnalyser;
}

async function createPreviewLoader(): Promise<PreviewFileLoader> {
  // Same instance as getBrowser(): it remembers the HAR entries whose bodies are previewed.
  const browser = await getBrowser();
  if (!(browser instanceof ExtensionBrowser)) return new FakePreviewFileLoader();
  return createPreviewFileLoader({
    getDevtoolsContent: (url) => browser.getResourceContent(url),
    fetch: globalThis.fetch.bind(globalThis),
  });
}

/** Memoised: DevTools-then-fetch loader in the extension, `FakePreviewFileLoader` otherwise. */
export function getPreviewFileLoader(): Promise<PreviewFileLoader> {
  if (_previewFileLoader == null) {
    _previewFileLoader = createPreviewLoader();
  }
  return _previewFileLoader;
}
