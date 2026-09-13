import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";
import { baseChartOptions, chartPalette, useReducedChartMotion } from "./chartSetup";

export default function EventTrendChart({ labels, values }) {
  const reducedMotion = useReducedChartMotion();
  const data = useMemo(() => ({
    labels,
    datasets: [{
      label: "Events",
      data: values,
      borderColor: chartPalette.teal,
      backgroundColor: "rgba(15, 118, 110, 0.13)",
      borderWidth: 2.5,
      pointRadius: 4,
      pointHoverRadius: 7,
      pointBackgroundColor: "#ffffff",
      pointBorderColor: chartPalette.teal,
      pointBorderWidth: 2,
      fill: true,
      tension: 0.3,
    }],
  }), [labels, values]);

  const options = useMemo(() => ({
    ...baseChartOptions(reducedMotion, "events"),
    interaction: { mode: "index", intersect: false },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: chartPalette.text, font: { size: 10 } } },
      y: { beginAtZero: true, grace: "15%", grid: { color: chartPalette.grid }, border: { display: false }, ticks: { precision: 0, color: chartPalette.text, font: { size: 10 } } },
    },
  }), [reducedMotion]);

  return <Line data={data} options={options} role="img" aria-label="Number of club events by year" />;
}
