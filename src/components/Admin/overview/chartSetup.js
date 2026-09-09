import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
);

export const chartPalette = {
  blue: "#1d4ed8",
  blueSoft: "rgba(29, 78, 216, 0.12)",
  teal: "#0f766e",
  amber: "#d97706",
  red: "#dc2626",
  grid: "rgba(100, 116, 139, 0.14)",
  text: "#667085",
};

export function useReducedChartMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function baseChartOptions(reducedMotion, suffix) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: reducedMotion ? 0 : 800,
      easing: "easeOutQuart",
    },
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: "top",
        align: "end",
        labels: {
          boxWidth: 8,
          boxHeight: 8,
          usePointStyle: true,
          pointStyle: "circle",
          color: chartPalette.text,
          padding: 18,
          font: { family: "Mona Sans Variable", size: 11, weight: 600 },
        },
      },
      tooltip: {
        backgroundColor: "#172033",
        titleFont: { family: "Mona Sans Variable", size: 12, weight: 700 },
        bodyFont: { family: "Mona Sans Variable", size: 11 },
        padding: 11,
        cornerRadius: 6,
        displayColors: false,
        callbacks: {
          label: (context) => `${context.parsed.y ?? context.parsed}: ${suffix}`,
        },
      },
    },
  };
}
