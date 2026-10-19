/** Test helper: hand-written `Codecs` that record calls and can be told to throw. */
import type { Codecs, RawImage } from "../codecs";

export interface FakeCodecs extends Codecs {
  calls: { decode: number; resize: number; encode: number };
  failDecode?: boolean;
  failResize?: boolean;
  failEncode?: boolean;
}

export function createFakeCodecs(size = { width: 100, height: 80 }): FakeCodecs {
  const image = (width: number, height: number): RawImage => ({
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  });
  const fake: FakeCodecs = {
    calls: { decode: 0, resize: 0, encode: 0 },
    async decode() {
      fake.calls.decode++;
      if (fake.failDecode) throw new Error("decode boom");
      return image(size.width, size.height);
    },
    async resize(_image, width, height) {
      fake.calls.resize++;
      if (fake.failResize) throw new Error("resize boom");
      return image(width, height);
    },
    async encode(img) {
      fake.calls.encode++;
      if (fake.failEncode) throw new Error("encode boom");
      return new Uint8Array(Math.max(1, Math.floor(img.width * img.height * 0.1)));
    },
  };
  return fake;
}
