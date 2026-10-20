import { describe, expect, it } from "vitest";
import { FontFaceLike, createDocumentFontRegistry } from "./font-registry";

function setup(opts: { loadFails?: boolean; createThrows?: boolean } = {}) {
  const added: FontFaceLike[] = [];
  const deleted: FontFaceLike[] = [];
  const created: Array<{ family: string; data: ArrayBuffer; descriptors: { weight: string; style: string } }> = [];
  const events: string[] = [];
  const registry = createDocumentFontRegistry({
    fonts: {
      add: (face) => {
        added.push(face);
        events.push("add");
      },
      delete: (face) => {
        deleted.push(face);
        return true;
      },
    },
    createFace: (family, data, descriptors) => {
      if (opts.createThrows) throw new Error("bad data");
      created.push({ family, data, descriptors });
      return {
        load: () => {
          events.push("load");
          return opts.loadFails ? Promise.reject(new Error("invalid font")) : Promise.resolve();
        },
      };
    },
  });
  return { registry, added, deleted, created, events };
}

describe("document font registry", () => {
  it("loads then adds the face, with normal descriptors", async () => {
    const { registry, added, created, events } = setup();
    const result = await registry.register(new Uint8Array([1, 2, 3]));
    expect(result.ok).toBe(true);
    expect(events).toEqual(["load", "add"]);
    expect(added).toHaveLength(1);
    expect(created[0]!.descriptors).toEqual({ weight: "normal", style: "normal" });
    if (result.ok) expect(result.family).toBe(created[0]!.family);
  });

  it("uses a unique private family per registration", async () => {
    const { registry, created } = setup();
    await registry.register(new Uint8Array(1));
    await registry.register(new Uint8Array(1));
    expect(created[0]!.family).toMatch(/^ecoinsights-preview-\d+$/);
    expect(created[1]!.family).not.toBe(created[0]!.family);
  });

  it("passes a copy of the bytes", async () => {
    const { registry, created } = setup();
    const bytes = new Uint8Array([9, 8, 7]);
    await registry.register(bytes);
    expect(created[0]!.data).not.toBe(bytes.buffer);
    bytes[0] = 0;
    expect(Array.from(new Uint8Array(created[0]!.data))).toEqual([9, 8, 7]);
  });

  it("copies only the view of a subarray", async () => {
    const { registry, created } = setup();
    await registry.register(new Uint8Array([1, 2, 3, 4]).subarray(1, 3));
    expect(Array.from(new Uint8Array(created[0]!.data))).toEqual([2, 3]);
  });

  it("deletes the face once on release", async () => {
    const { registry, deleted } = setup();
    const result = await registry.register(new Uint8Array(1));
    if (!result.ok) throw new Error("expected ok");
    result.release();
    result.release();
    expect(deleted).toHaveLength(1);
  });

  it("returns not ok when load rejects, adding nothing", async () => {
    const { registry, added } = setup({ loadFails: true });
    const result = await registry.register(new Uint8Array(1));
    expect(result).toEqual({ ok: false, message: "invalid font" });
    expect(added).toHaveLength(0);
  });

  it("returns not ok when createFace throws", async () => {
    const { registry } = setup({ createThrows: true });
    const result = await registry.register(new Uint8Array(1));
    expect(result.ok).toBe(false);
  });
});
