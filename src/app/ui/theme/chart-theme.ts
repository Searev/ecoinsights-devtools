/**
 * US-030: chart colours per theme and a helper applying them to a chart. Structural types only: no
 * `chart.js` import, so this module stays loadable anywhere.
 */
import { THEME_TOKENS } from "./theme-tokens";
import type { ResolvedTheme } from "./theme-types";

export interface ChartColours {
  text: string;
  grid: string;
  line: string;
  fill: string;
  tooltipBackground: string;
  tooltipText: string;
}

/** Loose structural view of Chart.js options: only what we set, anything else is kept. */
export interface ChartOptionsLike {
  [key: string]: unknown;
}
export interface DatasetLike {
  [key: string]: unknown;
}

const FILL_ALPHA = 0.5;

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function chartColours(theme: ResolvedTheme): ChartColours {
  const tokens = THEME_TOKENS[theme];
  return {
    text: tokens.chartText,
    grid: tokens.chartGrid,
    line: tokens.chartLine,
    fill: withAlpha(tokens.chartLine, FILL_ALPHA),
    tooltipBackground: tokens.tooltip,
    tooltipText: tokens.onTooltip,
  };
}

type Node = Record<string, unknown>;

/** Returns `parent[key]` as an object, creating it when missing or not an object. */
function child(parent: Node, key: string): Node {
  const existing = parent[key];
  if (typeof existing === "object" && existing !== null) return existing as Node;
  const created: Node = {};
  parent[key] = created;
  return created;
}

export function applyChartColours(
  target: { options: ChartOptionsLike; data: { datasets: DatasetLike[] } },
  colours: ChartColours,
): void {
  const options = target.options as Node;
  options.color = colours.text;
  options.borderColor = colours.line;

  const scales = child(options, "scales");
  for (const axis of ["x", "y"]) {
    const scale = child(scales, axis);
    child(scale, "ticks").color = colours.text;
    child(scale, "grid").color = colours.grid;
  }

  const plugins = child(options, "plugins");
  child(child(plugins, "legend"), "labels").color = colours.text;
  child(plugins, "title").color = colours.text;
  const tooltip = child(plugins, "tooltip");
  tooltip.backgroundColor = colours.tooltipBackground;
  tooltip.titleColor = colours.tooltipText;
  tooltip.bodyColor = colours.tooltipText;

  for (const dataset of target.data.datasets) {
    dataset.borderColor = colours.line;
    dataset.backgroundColor = colours.fill;
    dataset.pointBackgroundColor = colours.line;
    dataset.pointBorderColor = colours.line;
  }
}
