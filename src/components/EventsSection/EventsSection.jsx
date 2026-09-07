import { useEffect, useRef, useCallback } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import EventsList from "../EventsList";
import "./EventsSection.css";

gsap.registerPlugin(ScrollTrigger);

export default function EventsSection() {
  const sectionRef = useRef(null);
  const trackRef = useRef(null);
  const refreshTimerRef = useRef(null);

  const refreshScroll = useCallback(() => {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => ScrollTrigger.refresh(), 150);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;

    // On phones the events become a native vertical feed instead of a pinned
    // horizontal timeline. This avoids clipped cards and keeps touch navigation natural.
    if (window.matchMedia("(max-width: 767px)").matches) {
      section.dataset.scrolledLight = "false";
      return;
    }

    const getScrollDistance = () => Math.max(0, track.scrollWidth - window.innerWidth + 60);

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        pin: true,
        pinSpacing: true,
        scrub: 1,
        start: "top top",
        end: () => `+=${getScrollDistance()}`,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });

    // Seamless horizontal glide without clipping or early cutoff
    tl.to(
      track,
      {
        x: () => -getScrollDistance(),
        ease: "none",
        duration: 1,
      },
      0
    );

    // Continuous theme ambiance transition - scrub background, text and title colors
    tl.to(
      section,
      {
        backgroundColor: "#f4f3ee",
        color: "#1a1c23",
        ease: "none",
        duration: 1,
      },
      0
    );

    // Track when Events scroll turns into light background to coordinate header button color
    tl.eventCallback("onUpdate", () => {
      const p = tl.progress();
      const light = p >= 0.18 ? "true" : "false";
      if (section.dataset.scrolledLight !== light) {
        section.dataset.scrolledLight = light;
        window.dispatchEvent(new Event("rai:theme-change"));
      }
    });

    // ResizeObserver dynamically recalculates bounds when images and Supabase cards finish mounting
    const resizeObserver = new ResizeObserver(refreshScroll);
    resizeObserver.observe(track);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(refreshTimerRef.current);
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, [refreshScroll]);

  return (
    <section ref={sectionRef} id="events" className="events-section-pin">
      {/* Fixed Section Header Badge & Title */}
      <div className="events-header-fixed">
        <span className="events-tag-badge">EXPLORE</span>
        <h2 className="events-fixed-title">EVENTS</h2>
      </div>

      {/* Topographic Contour Line Background Pattern */}
      <div className="topographic-bg" aria-hidden="true">
        <svg viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
          <path
            d="M-100,200 C300,100 600,400 900,200 C1200,0 1500,300 1800,150"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeDasharray="4 4"
          />
          <path
            d="M-100,450 C250,300 550,600 950,350 C1250,150 1550,500 1850,300"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M-100,700 C350,550 650,800 1050,600 C1350,400 1650,750 1950,550"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeDasharray="6 6"
          />
        </svg>
      </div>

      {/* Horizontal Gallery Track */}
      <div ref={trackRef} className="events-horizontal-track">
        <EventsList onLoaded={refreshScroll} />
      </div>
    </section>
  );
}
