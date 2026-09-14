import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";
import { baseChartOptions, chartPalette, useReducedChartMotion } from "./chartSetup";

const SERIES_STYLES = Object.freeze({
  reach: { label: "Reach", borderColor: chartPalette.blue, backgroundColor: "rgba(29, 78, 216, 0.11)" },
  views: { label: "Views", borderColor: chartPalette.teal, backgroundColor: "rgba(15, 118, 110, 0.08)" },
});

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

export default function InstagramTrendChart({ trends }) {
  const reducedMotion = useReducedChartMotion();
  const entries = useMemo(() => Object.entries(trends).filter(([, points]) => Array.isArray(points) && points.length), [trends]);
  const timestamps = useMemo(() => [...new Set(entries.flatMap(([, points]) => points.map((point) => point.endTime).filter(Boolean)))].sort(), [entries]);
  const data = useMemo(() => ({
    labels: timestamps.map(dateLabel),
    datasets: entries.map(([metric, points]) => {
      const style = SERIES_STYLES[metric] || { label: metric, borderColor: chartPalette.blue, backgroundColor: chartPalette.blueSoft };
      const byTimestamp = new Map(points.map((point) => [point.endTime, point.value]));
      return {
        label: style.label,
        data: timestamps.map((timestamp) => byTimestamp.get(timestamp) ?? null),
        borderColor: style.borderColor,
        backgroundColor: style.backgroundColor,
        borderWidth: 2.5,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#ffffff",
        pointBorderColor: style.borderColor,
        pointBorderWidth: 2,
        fill: true,
        tension: 0.32,
        spanGaps: false,
      };
    }),
  }), [entries, timestamps]);

  const options = useMemo(() => ({
    ...baseChartOptions(reducedMotion, "Instagram results"),
    interaction: { mode: "index", intersect: false },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: chartPalette.text, font: { size: 10 }, maxTicksLimit: 12 } },
      y: { beginAtZero: true, grid: { color: chartPalette.grid }, border: { display: false }, ticks: { precision: 0, color: chartPalette.text, font: { size: 10 } } },
    },
  }), [reducedMotion]);

  const seriesNames = entries.map(([metric]) => SERIES_STYLES[metric]?.label || metric).join(" and ");
  return <Line data={data} options={options} role="img" aria-label={`Instagram ${seriesNames} over time`} />;
}
