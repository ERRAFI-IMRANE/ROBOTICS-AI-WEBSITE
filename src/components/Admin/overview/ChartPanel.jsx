import React from "react";

export default function ChartPanel({ title, description, summary, action, className = "", height, children }) {
  return (
    <section className={`admin-chart-widget ${className}`}>
      <header>
        <div><h2>{title}</h2><p>{description}</p></div>
        {(summary || action) && <div className="admin-chart-widget-actions">
          {summary && <span>{summary}</span>}
          {action}
        </div>}
      </header>
      <div className="admin-chart-widget-canvas" style={height ? { height } : undefined}>{children}</div>
    </section>
  );
}
