import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";
import { baseChartOptions, chartPalette, useReducedChartMotion } from "./chartSetup";

export default function RegistrationLineChart({ labels, values }) {
  const reducedMotion = useReducedChartMotion();
  const data = useMemo(() => ({
    labels,
    datasets: [{
      label: "Applications",
      data: values,
      borderColor: chartPalette.blue,
      backgroundColor: chartPalette.blueSoft,
      borderWidth: 2.5,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBackgroundColor: "#ffffff",
      pointBorderColor: chartPalette.blue,
      pointBorderWidth: 2,
      fill: true,
      tension: 0.34,
    }],
  }), [labels, values]);

  const options = useMemo(() => ({
    ...baseChartOptions(reducedMotion, "applications"),
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: chartPalette.text, font: { size: 10 } } },
      y: { beginAtZero: true, grace: "15%", grid: { color: chartPalette.grid }, border: { display: false }, ticks: { precision: 0, color: chartPalette.text, font: { size: 10 } } },
    },
  }), [reducedMotion]);

  return <Line data={data} options={options} />;
}
