import React, { useMemo } from "react";
import { Bar, Line } from "react-chartjs-2";
import { baseChartOptions, chartPalette, useReducedChartMotion } from "./chartSetup";

function videoLabel(video, index) {
  const source = video.title || video.description || `Video ${index + 1}`;
  return source.length > 22 ? `${source.slice(0, 21)}…` : source;
}

function axes() {
  return {
    x: { grid: { display: false }, border: { display: false }, ticks: { color: chartPalette.text, font: { size: 9 }, maxRotation: 0, autoSkip: true } },
    y: { beginAtZero: true, grace: "12%", grid: { color: chartPalette.grid }, border: { display: false }, ticks: { precision: 0, color: chartPalette.text, font: { size: 10 } } },
  };
}

export function TikTokViewsChart({ videos }) {
  const reducedMotion = useReducedChartMotion();
  const data = useMemo(() => ({
    labels: videos.map(videoLabel),
    datasets: [{ label: "Views", data: videos.map((video) => video.views), backgroundColor: chartPalette.blue, hoverBackgroundColor: chartPalette.teal, borderRadius: 3, borderSkipped: false, maxBarThickness: 42 }],
  }), [videos]);
  const options = useMemo(() => {
    const base = baseChartOptions(reducedMotion, "views");
    return { ...base, scales: axes(), plugins: { ...base.plugins, legend: { ...base.plugins.legend, display: false }, tooltip: { ...base.plugins.tooltip, callbacks: { title: (items) => videos[items[0]?.dataIndex]?.title || videos[items[0]?.dataIndex]?.description || "TikTok video", label: (context) => `${context.parsed.y.toLocaleString()} views` } } } };
  }, [reducedMotion, videos]);
  return <Bar data={data} options={options} role="img" aria-label="Current views for recent TikTok videos" />;
}

export function TikTokEngagementChart({ videos }) {
  const reducedMotion = useReducedChartMotion();
  const data = useMemo(() => ({
    labels: videos.map(videoLabel),
    datasets: [
      { label: "Likes", data: videos.map((video) => video.likes), backgroundColor: chartPalette.blue, stack: "engagement", borderRadius: 2 },
      { label: "Comments", data: videos.map((video) => video.comments), backgroundColor: chartPalette.teal, stack: "engagement", borderRadius: 2 },
      { label: "Shares", data: videos.map((video) => video.shares), backgroundColor: chartPalette.amber, stack: "engagement", borderRadius: 2 },
    ],
  }), [videos]);
  const options = useMemo(() => {
    const base = baseChartOptions(reducedMotion, "interactions");
    const scaleOptions = axes();
    scaleOptions.x.stacked = true;
    scaleOptions.y.stacked = true;
    return { ...base, scales: scaleOptions, plugins: { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { title: (items) => videos[items[0]?.dataIndex]?.title || videos[items[0]?.dataIndex]?.description || "TikTok video", label: (context) => `${context.dataset.label}: ${Number(context.parsed.y || 0).toLocaleString()}` } } } };
  }, [reducedMotion, videos]);
  return <Bar data={data} options={options} role="img" aria-label="Likes comments and shares for recent TikTok videos" />;
}

export function TikTokPerformanceChart({ videos }) {
  const reducedMotion = useReducedChartMotion();
  const ordered = useMemo(() => [...videos].filter((video) => video.createdAt).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)), [videos]);
  const data = useMemo(() => ({
    labels: ordered.map((video) => new Date(video.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })),
    datasets: [
      { label: "Current views", data: ordered.map((video) => video.views), borderColor: chartPalette.blue, backgroundColor: "rgba(29, 78, 216, 0.10)", borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 7, pointBackgroundColor: "#fff", pointBorderColor: chartPalette.blue, pointBorderWidth: 2, fill: true, tension: 0.28, yAxisID: "y" },
      { label: "Current engagement", data: ordered.map((video) => video.engagement), borderColor: chartPalette.teal, backgroundColor: "transparent", borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, tension: 0.28, yAxisID: "y1" },
    ],
  }), [ordered]);
  const options = useMemo(() => {
    const base = baseChartOptions(reducedMotion, "current total");
    return {
      ...base,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: axes().x,
        y: { ...axes().y, position: "left" },
        y1: { ...axes().y, position: "right", grid: { drawOnChartArea: false }, ticks: { ...axes().y.ticks, color: chartPalette.teal } },
      },
      plugins: { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { title: (items) => ordered[items[0]?.dataIndex]?.title || ordered[items[0]?.dataIndex]?.description || "TikTok video", label: (context) => `${context.dataset.label}: ${Number(context.parsed.y || 0).toLocaleString()}` } } },
    };
  }, [ordered, reducedMotion]);
  return <Line data={data} options={options} role="img" aria-label="Current TikTok video performance by publication date" />;
}
