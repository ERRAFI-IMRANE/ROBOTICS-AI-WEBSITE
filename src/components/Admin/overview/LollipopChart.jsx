import React, { useMemo } from "react";
import { Scatter } from "react-chartjs-2";
import { baseChartOptions, chartPalette, useReducedChartMotion } from "./chartSetup";

const lollipopStems = {
  id: "adminLollipopStems",
  beforeDatasetsDraw(chart) {
    const points = chart.getDatasetMeta(0).data;
    const origin = chart.scales.x.getPixelForValue(0);
    const { ctx } = chart;
    ctx.save();
    ctx.strokeStyle = "rgba(29, 78, 216, 0.34)";
    ctx.lineWidth = 2;
    points.forEach((point) => {
      ctx.beginPath();
      ctx.moveTo(origin, point.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    });
    ctx.restore();
  },
  afterDatasetsDraw(chart) {
    const points = chart.getDatasetMeta(0).data;
    const values = chart.data.datasets[0].data;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.fillStyle = "#344054";
    ctx.font = "700 10px 'Mona Sans Variable', sans-serif";
    ctx.textBaseline = "middle";
    points.forEach((point, index) => {
      const x = Math.min(point.x + 10, chartArea.right - 6);
      ctx.textAlign = x >= chartArea.right - 8 ? "right" : "left";
      ctx.fillText(String(values[index].x), x, point.y);
    });
    ctx.restore();
  },
};

export default function LollipopChart({ items, datasetLabel = "Candidates", ariaLabel }) {
  const reducedMotion = useReducedChartMotion();
  const ranked = useMemo(() => [...items].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)), [items]);
  const data = useMemo(() => ({
    datasets: [{
      label: datasetLabel,
      data: ranked.map((item) => ({ x: item.value, y: item.label })),
      pointRadius: 6,
      pointHoverRadius: 9,
      pointBackgroundColor: chartPalette.blue,
      pointBorderColor: "#ffffff",
      pointBorderWidth: 2,
    }],
  }), [datasetLabel, ranked]);

  const options = useMemo(() => {
    const base = baseChartOptions(reducedMotion, datasetLabel.toLowerCase());
    return {
      ...base,
      layout: { padding: { right: 28 } },
      interaction: { mode: "nearest", intersect: true },
      scales: {
        x: { beginAtZero: true, grace: "16%", grid: { color: chartPalette.grid }, border: { display: false }, ticks: { precision: 0, color: chartPalette.text, font: { size: 10 } } },
        y: { type: "category", labels: ranked.map((item) => item.label), offset: true, grid: { display: false }, border: { display: false }, ticks: { color: chartPalette.text, font: { size: 10 }, autoSkip: false } },
      },
      plugins: {
        ...base.plugins,
        legend: { ...base.plugins.legend, display: false },
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            title: (contexts) => contexts[0]?.raw?.y || "",
            label: (context) => `${context.raw.x} ${datasetLabel.toLowerCase()}`,
          },
        },
      },
    };
  }, [datasetLabel, ranked, reducedMotion]);

  return <Scatter data={data} options={options} plugins={[lollipopStems]} role="img" aria-label={ariaLabel} />;
}
