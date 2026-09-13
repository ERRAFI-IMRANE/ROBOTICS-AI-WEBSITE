import React, { useMemo } from "react";
import { PolarArea } from "react-chartjs-2";
import { baseChartOptions, chartPalette, useReducedChartMotion } from "./chartSetup";

const COLORS = ["#173f7b", "#1d5fca", "#0f766e", "#0e7490", "#b7791f", "#6d5bd0"];

export default function WorkEnvironmentPolarChart({ labels, shortLabels, values, ariaLabel }) {
  const reducedMotion = useReducedChartMotion();
  const data = useMemo(() => ({
    labels,
    datasets: [{
      label: "Candidates",
      data: values,
      backgroundColor: COLORS.map((color) => `${color}c9`),
      borderColor: "#ffffff",
      borderWidth: 2,
      hoverBorderWidth: 3,
    }],
  }), [labels, values]);

  const options = useMemo(() => {
    const base = baseChartOptions(reducedMotion, "candidates");
    return {
      ...base,
      scales: {
        r: {
          beginAtZero: true,
          grid: { color: chartPalette.grid },
          angleLines: { color: chartPalette.grid },
          ticks: { precision: 0, stepSize: 1, color: chartPalette.text, backdropColor: "transparent", font: { size: 8 } },
          pointLabels: { display: false },
        },
      },
      plugins: {
        ...base.plugins,
        legend: { ...base.plugins.legend, position: "bottom", align: "center", labels: { ...base.plugins.legend.labels, generateLabels: (chart) => chart.data.labels.map((_, index) => ({ text: shortLabels[index], fillStyle: chart.data.datasets[0].backgroundColor[index], strokeStyle: "#ffffff", hidden: !chart.getDataVisibility(index), index })) } },
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            title: (contexts) => contexts[0]?.label || "",
            label: (context) => `${context.raw} candidates`,
          },
        },
      },
    };
  }, [reducedMotion, shortLabels]);

  return <PolarArea data={data} options={options} role="img" aria-label={ariaLabel} />;
}
