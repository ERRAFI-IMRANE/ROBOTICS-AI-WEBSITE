import { useState, useEffect, useRef } from "react";
import "./TextAnimations.css";

/**
 * 5. SECTION HEADING REVEAL (Mask / clip-path bottom-to-top wipe)
 * Triggers once per heading upon entering viewport via IntersectionObserver.
 */
export function RevealHeadingLine({ children, className = "", delay = 0, as: Tag = "span" }) {
  const lineRef = useRef(null);

  useEffect(() => {
    const el = lineRef.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-revealed");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-revealed");
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -50px 0px" }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <Tag
      ref={lineRef}
      className={`reveal-heading-mask ${className}`}
      style={{ "--line-delay": `${delay}ms` }}
    >
      <span className="reveal-heading-text">{children}</span>
    </Tag>
  );
}

/**
 * 3. MARQUEE TICKER TEXT
 * Small ambient repeating text string scrolling in linear infinite loop.
 */
export function AmbientTicker({ text = "EST SAFI · ROBOTICS & AI CLUB · EST. 2024 · INNOVATE · BUILD · COMPETE · DISCOVER · AUTONOMOUS SYSTEMS · AI RESEARCH · " }) {
  return (
    <div className="ambient-ticker-bar" aria-hidden="true">
      <div className="ambient-ticker-track">
        <span className="ambient-ticker-text">
          {text}
          <span className="ambient-ticker-dot">✦</span>
          {text}
          <span className="ambient-ticker-dot">✦</span>
        </span>
        <span className="ambient-ticker-text">
          {text}
          <span className="ambient-ticker-dot">✦</span>
          {text}
          <span className="ambient-ticker-dot">✦</span>
        </span>
      </div>
    </div>
  );
}

/**
 * 1. PRELOADER GATE & 2. HERO HEADLINE ENTRANCE
 * Holds hero headline until user interacts with "Load RAI" trigger.
 * On interaction, preloader dismisses and triggers the fast staggered headline reveal.
 */
export function PreloaderGate({ onLoaded, systemName = "RAI" }) {
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  const handleTrigger = () => {
    setIsDismissed(true);
    // Chain: dismiss preloader first, then trigger hero reveal immediately after
    setTimeout(() => {
      if (onLoaded) onLoaded();
    }, 250);
  };

  return (
    <div className={`preloader-gate-backdrop ${isDismissed ? "is-dismissed" : ""}`}>
      <div className="preloader-gate-card">
        <p className="preloader-tagline">Robotics &amp; AI Club · EST Safi</p>
        <button
          type="button"
          className="preloader-btn-trigger"
          onClick={handleTrigger}
          autoFocus
        >
          <span className="preloader-pulse-dot" />
          <span>Load {systemName}</span>
        </button>
      </div>
    </div>
  );
}
