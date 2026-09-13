import React, { useMemo } from "react";
import { Doughnut } from "react-chartjs-2";
import { baseChartOptions, chartPalette, useReducedChartMotion } from "./chartSetup";

const DEFAULT_COLORS = [chartPalette.blue, chartPalette.teal, chartPalette.amber, chartPalette.red, "#64748b"];

export default function AnalyticsDoughnutChart({
  labels,
  values,
  colors = DEFAULT_COLORS,
  centerValue,
  centerLabel,
  datasetLabel = "Records",
  ariaLabel,
}) {
  const reducedMotion = useReducedChartMotion();
  const data = useMemo(() => ({
    labels,
    datasets: [{
      label: datasetLabel,
      data: values,
      backgroundColor: labels.map((_, index) => colors[index % colors.length]),
      hoverOffset: reducedMotion ? 0 : 5,
      borderColor: "#ffffff",
      borderWidth: 4,
    }],
  }), [colors, datasetLabel, labels, reducedMotion, values]);

  const options = useMemo(() => {
    const base = baseChartOptions(reducedMotion, datasetLabel.toLowerCase());
    return {
      ...base,
      cutout: "68%",
      interaction: { mode: "nearest", intersect: true },
      plugins: {
        ...base.plugins,
        legend: { ...base.plugins.legend, position: "bottom", align: "center" },
        tooltip: {
          ...base.plugins.tooltip,
          displayColors: true,
          callbacks: { label: (context) => `${context.label}: ${context.parsed}` },
        },
      },
    };
  }, [datasetLabel, reducedMotion]);

  return (
    <div className="admin-doughnut-wrap">
      <Doughnut data={data} options={options} role="img" aria-label={ariaLabel} />
      <div className="admin-doughnut-total" aria-hidden="true">
        <strong>{centerValue}</strong>
        <span>{centerLabel}</span>
      </div>
    </div>
  );
}
