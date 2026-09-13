import React, { useMemo } from "react";

const SHORT_LABELS = Object.freeze({
  "Hackathons / Technical Projects": "Technical Projects",
  "Photography / Video Coverage": "Photography / Video",
  "Graphic Design / Content Creation": "Design / Content",
  "Organizing Events": "Event Organization",
  "Communication / Partnerships": "Communication / Partnerships",
  "Workshops / Presentations": "Workshops / Presentations",
});

export default function RankedActivityProgress({ items, ariaLabel }) {
  const ranked = useMemo(() => [...items].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)), [items]);
  const maximum = Math.max(...ranked.map((item) => item.value), 1);

  return (
    <div className="admin-activity-progress" role="list" aria-label={ariaLabel}>
      {ranked.map((item, index) => (
        <div className="admin-activity-progress-row" role="listitem" key={item.label} title={`${item.label}: ${item.value} candidates`}>
          <div><span>{SHORT_LABELS[item.label] || item.label}</span><strong>{item.value}</strong></div>
          <div className="admin-activity-progress-track" aria-hidden="true">
            <i style={{ width: `${(item.value / maximum) * 100}%`, animationDelay: `${index * 55}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
