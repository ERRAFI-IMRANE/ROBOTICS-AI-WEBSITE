import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import HeroSection from "./components/HeroSection/HeroSection";
import HeroHeader from "./components/HeroHeader/HeroHeader";
import AboutSection from "./components/AboutSection/AboutSection";
import EventsSection from "./components/EventsSection/EventsSection";
import RAISection from "./components/RAISection/RAISection";
import TeamSection from "./components/TeamSection/TeamSection";
import WhyJoinSection from "./components/WhyJoinSection/WhyJoinSection";

gsap.registerPlugin(ScrollTrigger);

export default function App() {
  const heroWrapperRef = useRef(null);
  const heroInnerRef = useRef(null);
  const heroHeaderRef = useRef(null);
  const darkOverlayRef = useRef(null);

  useEffect(() => {
    const wrapper = heroWrapperRef.current;
    const inner = heroInnerRef.current;
    const header = heroHeaderRef.current;
    const darkOverlay = darkOverlayRef.current;
    if (!wrapper || !inner || !header || !darkOverlay) return;

    // Initialize Lenis smooth scroll engine for fluid scrolling animation between sections
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 2,
    });

    lenis.on("scroll", ScrollTrigger.update);

    const updateTicker = (time) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(updateTicker);
    gsap.ticker.lagSmoothing(0);

    // Pin the hero and zoom-out on scroll
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: wrapper,
        start: "top top",
        end: "+=120%",  // faster zoom-out transition
        scrub: 0.8,
        pin: true,
        pinSpacing: true,
        anticipatePin: 1,
        refreshPriority: 3,
        onUpdate: (self) => {
          header.classList.toggle("is-dark", self.progress > 0.3);
        },
      },
    });

    // Zoom out the hero card further while keeping sharp corners
    tl.to(inner, {
      scale: 0.52,
      opacity: 1,
      borderRadius: "0px",
      ease: "none",
      duration: 1,
    });

    // A blue filter grows over the fully opaque hero as it enters dark mode.
    tl.to(darkOverlay, {
      opacity: 0.76,
      ease: "none",
      duration: 1,
    }, 0);

    return () => {
      gsap.ticker.remove(updateTicker);
      lenis.destroy();
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, []);

  return (
    <div className="app-scroll-container">
      {/* Hero Wrapper — pinned during scroll zoom-out */}
      <div ref={heroWrapperRef} className="hero-zoom-wrapper">
        {/* Subtle topographic contour lines background */}
        <div className="hero-topo-bg" aria-hidden="true">
          <svg viewBox="0 0 1440 900" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M-100 200 C 300 100, 800 400, 1540 200" stroke="rgba(59, 130, 246, 0.08)" strokeWidth="1.5" />
            <path d="M-100 450 C 400 300, 900 650, 1540 400" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1.5" />
            <path d="M-100 700 C 350 550, 750 850, 1540 650" stroke="rgba(59, 130, 246, 0.06)" strokeWidth="1.5" />
          </svg>
        </div>

        {/* Full sentence ROBOTICS AND AI ESTS CLUB on each line behind zoomed-out hero card */}
        <div className="hero-behind-text-container" aria-hidden="true">
          <div className="hero-behind-text-track hero-behind-text-track--top">
            <span>ROBOTICS AND AI ESTS CLUB</span>
            <span className="dot-sep">&#8226;</span>
            <span>ROBOTICS AND AI ESTS CLUB</span>
            <span className="dot-sep">&#8226;</span>
            <span>ROBOTICS AND AI ESTS CLUB</span>
            <span className="dot-sep">&#8226;</span>
          </div>
          <div className="hero-behind-text-track hero-behind-text-track--middle">
            <span>ROBOTICS AND AI ESTS CLUB</span>
            <span className="dot-sep">&#8226;</span>
            <span>ROBOTICS AND AI ESTS CLUB</span>
            <span className="dot-sep">&#8226;</span>
            <span>ROBOTICS AND AI ESTS CLUB</span>
            <span className="dot-sep">&#8226;</span>
          </div>
          <div className="hero-behind-text-track hero-behind-text-track--bottom">
            <span>ROBOTICS AND AI ESTS CLUB</span>
            <span className="dot-sep">&#8226;</span>
            <span>ROBOTICS AND AI ESTS CLUB</span>
            <span className="dot-sep">&#8226;</span>
            <span>ROBOTICS AND AI ESTS CLUB</span>
            <span className="dot-sep">&#8226;</span>
          </div>
        </div>

        <div ref={heroInnerRef} className="hero-zoom-inner">
          <HeroSection />
          <div ref={darkOverlayRef} className="hero-dark-overlay" aria-hidden="true" />
        </div>
      </div>

      <HeroHeader headerRef={heroHeaderRef} />

      {/* About Section — appears after zoom-out completes */}
      <AboutSection />

      {/* Events Section — upcoming workshops and hackathons */}
      <EventsSection />

      {/* RAI Section — Club introduction & Swipe Image */}
      <RAISection />

      {/* Team Section — Dark mode leadership and members */}
      <TeamSection />

      {/* Why Join Us Section — Student Club Experience & Innovation */}
      <WhyJoinSection />
    </div>
  );
}
