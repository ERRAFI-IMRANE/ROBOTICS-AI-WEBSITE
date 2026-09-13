import React, { useMemo } from "react";
import { Radar } from "react-chartjs-2";
import { baseChartOptions, chartPalette, useReducedChartMotion } from "./chartSetup";

const SHORT_LABELS = ["Leads", "Organizes", "Creative ideas", "Technical", "Communicates", "Supports"];

export default function PersonalityRadarChart({ labels, values, ariaLabel }) {
  const reducedMotion = useReducedChartMotion();
  const data = useMemo(() => ({
    labels,
    datasets: [{
      label: "Candidates",
      data: values,
      borderColor: chartPalette.teal,
      backgroundColor: "rgba(15, 118, 110, 0.16)",
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 6,
      pointBackgroundColor: "#ffffff",
      pointBorderColor: chartPalette.teal,
      pointBorderWidth: 2,
    }],
  }), [labels, values]);

  const options = useMemo(() => {
    const base = baseChartOptions(reducedMotion, "candidates");
    return {
      ...base,
      interaction: { mode: "nearest", intersect: true },
      scales: {
        r: {
          beginAtZero: true,
          suggestedMax: Math.max(...values, 1) + 1,
          angleLines: { color: chartPalette.grid },
          grid: { color: chartPalette.grid },
          pointLabels: { color: chartPalette.text, font: { size: 9, weight: 600 }, callback: (_label, index) => SHORT_LABELS[index] },
          ticks: { precision: 0, stepSize: 1, color: chartPalette.text, backdropColor: "transparent", font: { size: 8 } },
        },
      },
      plugins: {
        ...base.plugins,
        legend: { ...base.plugins.legend, display: false },
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            title: (contexts) => contexts[0]?.label || "",
            label: (context) => `${context.parsed.r} candidates`,
          },
        },
      },
    };
  }, [reducedMotion, values]);

  return <Radar data={data} options={options} role="img" aria-label={ariaLabel} />;
}
