import "./SiteLoader.css";

export default function SiteLoader({ phase = "loading", progress = 0, stage = "Loading" }) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div
      className={`site-loader ${phase === "exiting" ? "is-exiting" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={`${stage}. ${safeProgress}% complete.`}
    >
      <div className="site-loader-word" data-text="LOADING" aria-hidden="true">
        <span className="site-loader-word-base">LOADING</span>
        <span className="site-loader-word-glass">LOADING</span>
      </div>
      <span className="site-loader-progress-value" aria-hidden="true">
        {String(safeProgress).padStart(2, "0")}%
      </span>
    </div>
  );
}
