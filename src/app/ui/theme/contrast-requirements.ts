/**
 * US-030 scenario 10: the contrast pairs every theme must satisfy (WCAG AA: 4.5:1 for text, 3:1 for
 * meaningful UI parts). Loaded by `tailwind.config.ts`: relative imports only.
 */
import type { ThemeTokenName } from "./theme-types";

export interface ContrastRequirement {
  foreground: ThemeTokenName;
  background: ThemeTokenName;
  minimum: 4.5 | 3;
  usage: string;
}

export interface ContrastException {
  foreground: ThemeTokenName;
  background: ThemeTokenName;
  reason: string;
}

const text = (foreground: ThemeTokenName, background: ThemeTokenName, usage: string): ContrastRequirement => ({
  foreground,
  background,
  minimum: 4.5,
  usage,
});
const ui = (foreground: ThemeTokenName, background: ThemeTokenName, usage: string): ContrastRequirement => ({
  foreground,
  background,
  minimum: 3,
  usage,
});

export const CONTRAST_REQUIREMENTS: readonly ContrastRequirement[] = [
  text("onsurface", "background", "default text on the page"),
  text("onsurface", "surface", "text on toolbar, panels and inputs"),
  text("onsurface", "surfaceLight", "text on hovered items"),
  text("onsurface", "tableEven", "text on the table header"),
  text("onsurface", "tableOdd", "text on a hovered detail row"),
  text("strong", "background", "headings and emphasised text"),
  text("strong", "surface", "toolbar, dialog and button text"),
  text("strong", "surfaceLight", "emphasised text on hover"),
  text("strong", "tableOdd", "emphasised text on a hovered detail row"),
  text("onBtn", "btn", "primary button label"),
  text("onBtn", "btnHover", "primary button label on hover"),
  text("onBtn", "dangerStrong", "danger button label"),
  text("onBtn", "dangerHover", "danger button label on hover"),
  text("onSelected", "selected", "text of the selected row"),
  text("onSelected", "selectedHover", "text of the selected row on hover"),
  text("onTooltip", "tooltip", "tooltip text"),
  text("onChip", "chip", "Non évaluée chip text"),
  text("placeholder", "surface", "placeholder of a form field"),
  text("warning", "surface", "warning text in dialogs"),
  text("warning", "background", "warning text on the page"),
  text("chartText", "background", "chart ticks and legend on the page"),
  text("chartText", "surface", "chart ticks and legend on a panel"),
  ui("field", "background", "form field border on the page"),
  ui("field", "surface", "form field border on a panel"),
  ui("focus", "background", "focus outline on the page"),
  ui("focus", "surface", "focus outline on a panel"),
  ui("focus", "surfaceLight", "focus outline on a hovered item"),
  ui("danger", "background", "danger border"),
  ui("complianceA", "background", "compliance square A on the page"),
  ui("complianceA", "surface", "compliance square A on a panel"),
  ui("complianceB", "background", "compliance square B on the page"),
  ui("complianceB", "surface", "compliance square B on a panel"),
  ui("complianceC", "background", "compliance square C on the page"),
  ui("complianceC", "surface", "compliance square C on a panel"),
  ui("complianceNone", "background", "not evaluated square on the page"),
  ui("complianceNone", "surface", "not evaluated square on a panel"),
  ui("marker", "background", "metric markers"),
  ui("chartLine", "background", "chart line on the page"),
  ui("chartLine", "surface", "chart line on a panel"),
  ui("loader", "background", "loader spinner"),
  ui("iconMuted", "background", "Add icon"),
  ui("btn", "background", "secondary button border on the page"),
  ui("btn", "surface", "secondary button border on a panel"),
];

/** Non-text pairs that already fail 3:1 in today's dark theme; kept as is (dark must not change). */
export const DARK_CONTRAST_EXCEPTIONS: readonly ContrastException[] = [
  { foreground: "complianceC", background: "surface", reason: "red square on a panel, kept as today" },
  { foreground: "complianceNone", background: "surface", reason: "grey square on a panel, kept as today" },
  { foreground: "loader", background: "background", reason: "indigo spinner on the page, kept as today" },
  { foreground: "btn", background: "background", reason: "brand blue border on the page, kept as today" },
  { foreground: "btn", background: "surface", reason: "brand blue border on a panel, kept as today" },
];
