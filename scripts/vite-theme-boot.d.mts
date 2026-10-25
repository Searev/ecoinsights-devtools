import type { Plugin } from "vite";

/** Bundles the theme boot entry into a minified classic script (ARCH-DECISION-035). */
export function buildThemeBoot(entry: string): Promise<string>;

/** Serves (dev) or emits (build) the boot script and prepends it to the head of `htmlFile`. */
export function themeBootPlugin(options: { entry: string; fileName?: string; htmlFile?: string }): Plugin;
