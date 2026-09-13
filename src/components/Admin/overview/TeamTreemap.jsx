import React, { useMemo } from "react";

const TREEMAP_COLORS = ["#173f7b", "#1d5fca", "#0f766e", "#0e7490", "#6d5bd0", "#475467", "#b7791f", "#2563a8", "#53709a"];

function partition(items, rect) {
  if (items.length === 1) return [{ ...items[0], ...rect }];

  const total = items.reduce((sum, item) => sum + item.value, 0);
  let running = 0;
  let splitAt = 1;
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < items.length; index += 1) {
    running += items[index - 1].value;
    const distance = Math.abs(total / 2 - running);
    if (distance < closest) {
      closest = distance;
      splitAt = index;
    }
  }

  const first = items.slice(0, splitAt);
  const second = items.slice(splitAt);
  const firstTotal = first.reduce((sum, item) => sum + item.value, 0);
  const ratio = firstTotal / total;
  if (rect.width >= rect.height) {
    const firstWidth = rect.width * ratio;
    return [
      ...partition(first, { ...rect, width: firstWidth }),
      ...partition(second, { x: rect.x + firstWidth, y: rect.y, width: rect.width - firstWidth, height: rect.height }),
    ];
  }

  const firstHeight = rect.height * ratio;
  return [
    ...partition(first, { ...rect, height: firstHeight }),
    ...partition(second, { x: rect.x, y: rect.y + firstHeight, width: rect.width, height: rect.height - firstHeight }),
  ];
}

export default function TeamTreemap({ items, ariaLabel }) {
  const blocks = useMemo(() => {
    const ranked = items.filter((item) => item.value > 0).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    return ranked.length ? partition(ranked, { x: 0, y: 0, width: 100, height: 100 }) : [];
  }, [items]);

  return (
    <div className="admin-team-treemap" role="list" aria-label={ariaLabel}>
      {blocks.map((block, index) => (
        <div
          key={block.label}
          className="admin-team-treemap-block"
          role="listitem"
          tabIndex={0}
          title={`${block.label}: ${block.value} member${block.value === 1 ? "" : "s"}`}
          aria-label={`${block.label}: ${block.value} member${block.value === 1 ? "" : "s"}`}
          style={{
            left: `${block.x}%`,
            top: `${block.y}%`,
            width: `${block.width}%`,
            height: `${block.height}%`,
            backgroundColor: TREEMAP_COLORS[index % TREEMAP_COLORS.length],
          }}
        >
          <span>{block.label}</span>
          <strong>{block.value}</strong>
        </div>
      ))}
    </div>
  );
}
