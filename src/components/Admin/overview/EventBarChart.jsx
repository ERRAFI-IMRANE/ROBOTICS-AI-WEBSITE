import React, { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import { baseChartOptions, chartPalette, useReducedChartMotion } from "./chartSetup";

export default function EventBarChart({ labels, values }) {
  const reducedMotion = useReducedChartMotion();
  const data = useMemo(() => ({
    labels,
    datasets: [{
      label: "Events",
      data: values,
      backgroundColor: chartPalette.teal,
      hoverBackgroundColor: "#115e59",
      borderRadius: 4,
      borderSkipped: false,
      maxBarThickness: 34,
    }],
  }), [labels, values]);

  const options = useMemo(() => ({
    ...baseChartOptions(reducedMotion, "events"),
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: chartPalette.text, font: { size: 10 } } },
      y: { beginAtZero: true, grace: "15%", grid: { color: chartPalette.grid }, border: { display: false }, ticks: { precision: 0, color: chartPalette.text, font: { size: 10 } } },
    },
  }), [reducedMotion]);

  return <Bar data={data} options={options} />;
}
