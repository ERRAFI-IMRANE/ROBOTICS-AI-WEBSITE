import React, { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import { baseChartOptions, chartPalette, useReducedChartMotion } from "./chartSetup";

export default function AnalyticsBarChart({ labels, values, horizontal = false, datasetLabel, color = chartPalette.blue, ariaLabel }) {
  const reducedMotion = useReducedChartMotion();
  const data = useMemo(() => ({
    labels,
    datasets: [{
      label: datasetLabel,
      data: values,
      backgroundColor: color,
      hoverBackgroundColor: chartPalette.teal,
      borderRadius: 4,
      borderSkipped: false,
      maxBarThickness: horizontal ? 22 : 38,
    }],
  }), [color, datasetLabel, horizontal, labels, values]);

  const options = useMemo(() => {
    const base = baseChartOptions(reducedMotion, datasetLabel.toLowerCase());
    const categoryAxis = { grid: { display: false }, border: { display: false }, ticks: { color: chartPalette.text, font: { size: 10 }, autoSkip: false } };
    const valueAxis = { beginAtZero: true, grace: "15%", grid: { color: chartPalette.grid }, border: { display: false }, ticks: { precision: 0, color: chartPalette.text, font: { size: 10 } } };
    return {
      ...base,
      indexAxis: horizontal ? "y" : "x",
      scales: horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
      plugins: {
        ...base.plugins,
        legend: { ...base.plugins.legend, display: false },
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            label: (context) => `${context.parsed[horizontal ? "x" : "y"]} ${datasetLabel.toLowerCase()}`,
          },
        },
      },
    };
  }, [datasetLabel, horizontal, reducedMotion]);

  return <Bar data={data} options={options} role="img" aria-label={ariaLabel} />;
}
