import React, { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import { baseChartOptions, chartPalette, useReducedChartMotion } from "./chartSetup";

export default function InterviewColumnChart({ labels, shortLabels, values, ariaLabel }) {
  const reducedMotion = useReducedChartMotion();
  const data = useMemo(() => ({
    labels,
    datasets: [{
      label: "Candidates",
      data: values,
      backgroundColor: "#475467",
      hoverBackgroundColor: chartPalette.blue,
      borderRadius: 5,
      borderSkipped: false,
      maxBarThickness: 44,
    }],
  }), [labels, values]);

  const options = useMemo(() => {
    const base = baseChartOptions(reducedMotion, "candidates");
    return {
      ...base,
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: chartPalette.text, font: { size: 9 }, callback: (value) => shortLabels[value] || "" } },
        y: { beginAtZero: true, grace: "15%", grid: { color: chartPalette.grid }, border: { display: false }, ticks: { precision: 0, color: chartPalette.text, font: { size: 10 } } },
      },
      plugins: {
        ...base.plugins,
        legend: { ...base.plugins.legend, display: false },
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            title: (contexts) => contexts[0]?.label || "",
            label: (context) => `${context.parsed.y} candidates`,
          },
        },
      },
    };
  }, [reducedMotion, shortLabels]);

  return <Bar data={data} options={options} role="img" aria-label={ariaLabel} />;
}
