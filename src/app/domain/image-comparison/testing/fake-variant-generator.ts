import { EstimationJob } from "../../models/image-estimation";
import {
  ImageFileInfo,
  ImageFileResult,
  ImageVariantGenerator,
} from "../../models/image-variants";

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A loaded file of `byteLength` bytes (test helper). */
export function loadedFile(byteLength: number, info: Partial<ImageFileInfo> = {}): ImageFileResult {
  return {
    status: "loaded",
    bytes: new Uint8Array(byteLength),
    info: {
      format: "jpeg",
      width: 1200,
      height: 800,
      byteLength,
      mimeType: "image/jpeg",
      ...info,
    },
  };
}

/**
 * Hand-written fake generator: every call records its arguments and waits for the test to settle
 * its deferred (`loads[i].resolve(...)`, `generates[i].resolve(...)`).
 */
export class FakeVariantGenerator implements ImageVariantGenerator {
  readonly loads: Array<{ url: string; declaredType: string } & Deferred<ImageFileResult>> = [];
  readonly generates: Array<
    { job: EstimationJob; original: Uint8Array } & Deferred<ImageFileResult>
  > = [];

  loadOriginal(url: string, declaredType: string): Promise<ImageFileResult> {
    const d = deferred<ImageFileResult>();
    this.loads.push({ url, declaredType, ...d });
    return d.promise;
  }

  generate(job: EstimationJob, original: Uint8Array): Promise<ImageFileResult> {
    const d = deferred<ImageFileResult>();
    this.generates.push({ job, original, ...d });
    return d.promise;
  }
}

/** Lets every pending promise continuation run. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
