import { useEffect, useRef, useCallback } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import EventsList from "../EventsList";
import "./EventsSection.css";

gsap.registerPlugin(ScrollTrigger);

export default function EventsSection() {
  const sectionRef = useRef(null);
  const trackRef = useRef(null);

  const refreshScroll = useCallback(() => {
    ScrollTrigger.refresh();
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;

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

    // Continuous theme ambiance transition
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

    // ResizeObserver dynamically recalculates bounds when images and Supabase cards finish mounting
    const resizeObserver = new ResizeObserver(() => {
      ScrollTrigger.refresh();
    });
    resizeObserver.observe(track);

    return () => {
      resizeObserver.disconnect();
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, []);

  return (
    <section ref={sectionRef} id="events" className="events-section-pin">
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
