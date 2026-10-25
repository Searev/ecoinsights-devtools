import { describe, expect, it } from "vitest";
import { applyChartColours, chartColours } from "./chart-theme";
import { THEME_TOKENS } from "./theme-tokens";

describe("chartColours", () => {
  it("keeps the dark chart colours", () => {
    expect(chartColours("dark")).toEqual({
      text: "#bfc6ce",
      grid: "#474747",
      line: "#36a2eb",
      fill: "rgba(54, 162, 235, 0.5)",
      tooltipBackground: "#555555",
      tooltipText: "#ffffff",
    });
  });

  it("derives the light colours from the light tokens", () => {
    const light = THEME_TOKENS.light;
    const c = chartColours("light");
    expect(c.text).toBe(light.chartText);
    expect(c.grid).toBe(light.chartGrid);
    expect(c.line).toBe(light.chartLine);
    expect(c.tooltipBackground).toBe(light.tooltip);
    expect(c.tooltipText).toBe(light.onTooltip);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(light.chartLine.slice(i, i + 2), 16));
    expect(c.fill).toBe(`rgba(${r}, ${g}, ${b}, 0.5)`);
  });
});

describe("applyChartColours", () => {
  const colours = chartColours("dark");

  it("creates missing nested objects and sets every colour", () => {
    const target = { options: {} as Record<string, any>, data: { datasets: [{ label: "a" }, {}] as Record<string, any>[] } };
    applyChartColours(target, colours);
    const o = target.options;
    expect(o.color).toBe(colours.text);
    expect(o.borderColor).toBe(colours.line);
    expect(o.scales.x.ticks.color).toBe(colours.text);
    expect(o.scales.x.grid.color).toBe(colours.grid);
    expect(o.scales.y.ticks.color).toBe(colours.text);
    expect(o.scales.y.grid.color).toBe(colours.grid);
    expect(o.plugins.legend.labels.color).toBe(colours.text);
    expect(o.plugins.title.color).toBe(colours.text);
    expect(o.plugins.tooltip.backgroundColor).toBe(colours.tooltipBackground);
    expect(o.plugins.tooltip.titleColor).toBe(colours.tooltipText);
    expect(o.plugins.tooltip.bodyColor).toBe(colours.tooltipText);
    for (const d of target.data.datasets) {
      expect(d.borderColor).toBe(colours.line);
      expect(d.backgroundColor).toBe(colours.fill);
      expect(d.pointBackgroundColor).toBe(colours.line);
      expect(d.pointBorderColor).toBe(colours.line);
    }
    expect(target.data.datasets[0].label).toBe("a");
  });

  it("keeps unrelated options", () => {
    const target = {
      options: {
        responsive: true,
        scales: { x: { type: "linear", ticks: { stepSize: 5 } } },
        plugins: { legend: { display: false } },
      } as Record<string, any>,
      data: { datasets: [] },
    };
    applyChartColours(target, colours);
    expect(target.options.responsive).toBe(true);
    expect(target.options.scales.x.type).toBe("linear");
    expect(target.options.scales.x.ticks.stepSize).toBe(5);
    expect(target.options.scales.x.ticks.color).toBe(colours.text);
    expect(target.options.plugins.legend.display).toBe(false);
  });

  it("can be applied twice with different colours", () => {
    const target = { options: {} as Record<string, any>, data: { datasets: [{}] as Record<string, any>[] } };
    applyChartColours(target, colours);
    applyChartColours(target, chartColours("light"));
    expect(target.options.color).toBe(chartColours("light").text);
    expect(target.data.datasets[0].borderColor).toBe(chartColours("light").line);
  });
});
