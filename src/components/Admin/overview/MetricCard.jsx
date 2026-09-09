import React, { useEffect, useState } from "react";

function useCountUp(value, duration = 750) {
  const numericValue = Number(value) || 0;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayValue(numericValue);
      return undefined;
    }

    const start = performance.now();
    let frame;
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(numericValue * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, numericValue]);

  return displayValue;
}

export default function MetricCard({ label, value, note, tone = "blue", onClick }) {
  const displayValue = useCountUp(value);
  return (
    <button className={`admin-metric-widget is-${tone}`} type="button" onClick={onClick} disabled={!onClick} aria-label={`${label}: ${value}. ${note}`}>
      <span className="admin-metric-widget-signal" aria-hidden="true" />
      <span className="admin-metric-widget-label">{label}</span>
      <strong>{displayValue.toLocaleString()}</strong>
      <small>{note}</small>
    </button>
  );
}
