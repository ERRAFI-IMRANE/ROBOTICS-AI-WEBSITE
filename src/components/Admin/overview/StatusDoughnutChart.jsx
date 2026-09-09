import React, { useMemo } from "react";
import { Doughnut } from "react-chartjs-2";
import { baseChartOptions, chartPalette, useReducedChartMotion } from "./chartSetup";

export default function StatusDoughnutChart({ labels, values, total }) {
  const reducedMotion = useReducedChartMotion();
  const data = useMemo(() => ({
    labels,
    datasets: [{
      label: "Applications",
      data: values,
      backgroundColor: [chartPalette.amber, chartPalette.teal, chartPalette.red],
      hoverOffset: reducedMotion ? 0 : 5,
      borderColor: "#ffffff",
      borderWidth: 4,
    }],
  }), [labels, reducedMotion, values]);

  const options = useMemo(() => ({
    ...baseChartOptions(reducedMotion, "applications"),
    cutout: "68%",
    interaction: { mode: "nearest", intersect: true },
    plugins: {
      ...baseChartOptions(reducedMotion, "applications").plugins,
      legend: {
        ...baseChartOptions(reducedMotion, "applications").plugins.legend,
        position: "bottom",
        align: "center",
      },
      tooltip: {
        ...baseChartOptions(reducedMotion, "applications").plugins.tooltip,
        callbacks: { label: (context) => `${context.label}: ${context.parsed}` },
      },
    },
  }), [reducedMotion]);

  return (
    <div className="admin-doughnut-wrap">
      <Doughnut data={data} options={options} />
      <div className="admin-doughnut-total" aria-hidden="true"><strong>{total}</strong><span>Total</span></div>
    </div>
  );
}
