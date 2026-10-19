import { describe, expect, it } from "vitest";
import { createJsquashCodecs } from "../jsquash-codecs";
import { loadWasmFromNodeModules } from "./node-wasm";
import { makeRawImage } from "./synthetic";

/** Measures the AVIF q65 speed 6 encode of a ~2 MP image (D1/D3); prints the figure, asserts a loose ceiling. */
describe("AVIF encode timing", () => {
  it("encodes a 1920x1080 synthetic image at q65 speed 6 in a reasonable time", async () => {
    const codecs = createJsquashCodecs(loadWasmFromNodeModules);
    const image = makeRawImage(1920, 1080);
    await codecs.encode(makeRawImage(64, 64), { format: "avif", quality: 65, speed: 6 }); // warm up (compile)
    const start = performance.now();
    const bytes = await codecs.encode(image, { format: "avif", quality: 65, speed: 6 });
    const seconds = (performance.now() - start) / 1000;
    console.log(`AVIF q65 speed 6, 1920x1080 (2.07 MP): ${seconds.toFixed(2)} s, ${bytes.length} bytes`);
    expect(bytes.length).toBeGreaterThan(0);
    expect(seconds).toBeLessThan(30);
  }, 60_000);
});
