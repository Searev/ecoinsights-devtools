/**
 * US-018, ARCH-DECISION-023: registers a font from its bytes in a `FontFaceSet` (the panel's
 * `document.fonts`, never the inspected page) under a private family, and releases it on demand.
 */
export interface FontFaceLike {
  load(): Promise<unknown>;
}

export interface FontSetLike {
  add(face: FontFaceLike): void;
  delete(face: FontFaceLike): boolean;
}

export type FontRegistration =
  | { ok: true; family: string; release(): void }
  | { ok: false; message?: string };

/** Never rejects. */
export interface FontRegistry {
  register(bytes: Uint8Array): Promise<FontRegistration>;
}

export function createDocumentFontRegistry(deps: {
  fonts: FontSetLike;
  createFace: (
    family: string,
    data: ArrayBuffer,
    descriptors: { weight: string; style: string }
  ) => FontFaceLike;
}): FontRegistry {
  let counter = 0;
  return {
    async register(bytes) {
      const family = `ecoinsights-preview-${++counter}`;
      try {
        // A copy: the face may detach it, and the preview cache keeps its bytes.
        const face = deps.createFace(family, bytes.slice().buffer, { weight: "normal", style: "normal" });
        await face.load();
        deps.fonts.add(face);
        let released = false;
        return {
          ok: true,
          family,
          release() {
            if (released) return;
            released = true;
            deps.fonts.delete(face);
          },
        };
      } catch (reason) {
        return { ok: false, ...(reason instanceof Error ? { message: reason.message } : {}) };
      }
    },
  };
}
