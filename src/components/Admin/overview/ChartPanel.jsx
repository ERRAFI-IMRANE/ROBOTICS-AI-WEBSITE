import React from "react";

export default function ChartPanel({ title, description, summary, className = "", children }) {
  return (
    <section className={`admin-chart-widget ${className}`}>
      <header>
        <div><h2>{title}</h2><p>{description}</p></div>
        {summary && <span>{summary}</span>}
      </header>
      <div className="admin-chart-widget-canvas">{children}</div>
    </section>
  );
}
