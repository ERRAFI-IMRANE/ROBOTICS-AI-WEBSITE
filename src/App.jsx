import { useState, useEffect, useRef } from "react";
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
import PartnersSection from "./components/PartnersSection/PartnersSection";
import SocialsAlbumSection from "./components/SocialsAlbumSection/SocialsAlbumSection";
import Footer from "./components/Footer/Footer";
import { AmbientTicker } from "./components/common/TextAnimations";
import AdminDashboard from "./components/Admin/AdminDashboard";
import AdminAuthModal from "./components/Admin/AdminAuthModal";
import RegistrationPage from "./components/RegistrationPage/RegistrationPage";
import { SpeedInsights } from "@vercel/speed-insights/react";

gsap.registerPlugin(ScrollTrigger);

export default function App() {
  const [currentView, setCurrentView] = useState(() => {
    if (typeof window === "undefined") return "home";
    const hash = (window.location.hash || "").toLowerCase();
    const search = (window.location.search || "").toLowerCase();
    if (hash === "#admin" || search.includes("view=admin")) return "admin";
    if (hash === "#register" || hash === "#join" || hash === "#join-us" || search.includes("view=register")) return "register";
    return "home";
  });

  const heroWrapperRef = useRef(null);
  const heroInnerRef = useRef(null);
  const heroHeaderRef = useRef(null);
  const darkOverlayRef = useRef(null);

  const navigateTo = (view) => {
    if (view === "admin") {
      window.location.hash = "admin";
      setCurrentView("admin");
    } else if (view === "register") {
      window.location.hash = "register";
      setCurrentView("register");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      if (window.location.hash) {
        window.history.pushState(null, "", window.location.pathname + window.location.search);
      }
      setCurrentView("home");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const handleRouteCheck = () => {
      const hash = (window.location.hash || "").toLowerCase();
      const search = (window.location.search || "").toLowerCase();

      if (hash === "#admin" || search.includes("view=admin")) {
        setCurrentView("admin");
      } else if (hash === "#register" || hash === "#join" || hash === "#join-us" || search.includes("view=register")) {
        setCurrentView("register");
      } else {
        setCurrentView("home");
      }
    };

    handleRouteCheck();
    window.addEventListener("hashchange", handleRouteCheck);
    window.addEventListener("popstate", handleRouteCheck);
    return () => {
      window.removeEventListener("hashchange", handleRouteCheck);
      window.removeEventListener("popstate", handleRouteCheck);
    };
  }, []);

  useEffect(() => {
    if (currentView !== "home") return;

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

    // Dynamic 3-dash button & header theme coordinator matching user section specifications
    const updateHeaderTheme = () => {
      const whyJoinEl = document.getElementById("why-join");
      const teamEl = document.getElementById("team");
      const raiEl = document.getElementById("rai");
      const eventsEl = document.getElementById("events");

      const headerOffset = 65;

      // 1. After team section until the end of the page (WhyJoin, Partners, Socials, Footer) -> BLACK
      if (whyJoinEl && whyJoinEl.getBoundingClientRect().top <= headerOffset) {
        header.classList.add("btn-is-black");
        header.classList.remove("is-dark");
        return;
      }

      // 2. Team section (dark #0c0d12 background) -> WHITE
      if (teamEl && teamEl.getBoundingClientRect().top <= headerOffset) {
        header.classList.remove("btn-is-black");
        header.classList.add("is-dark");
        return;
      }

      // 3. Img slide section (RAI - light #f4f3ee background) -> BLACK
      if (raiEl && raiEl.getBoundingClientRect().top <= headerOffset) {
        header.classList.add("btn-is-black");
        header.classList.remove("is-dark");
        return;
      }

      // 4. Event section with scroll -> BLACK once background becomes light in events, otherwise WHITE
      if (eventsEl && eventsEl.getBoundingClientRect().top <= headerOffset) {
        const isEventsScrolledLight = eventsEl.dataset.scrolledLight === "true";
        if (isEventsScrolledLight) {
          header.classList.add("btn-is-black");
          header.classList.remove("is-dark");
        } else {
          header.classList.remove("btn-is-black");
          header.classList.add("is-dark");
        }
        return;
      }

      // 5. Before event section (Hero until event section) -> WHITE
      header.classList.remove("btn-is-black");
      header.classList.add("is-dark");
    };

    lenis.on("scroll", () => {
      ScrollTrigger.update();
      updateHeaderTheme();
    });

    const updateTicker = (time) => {
      lenis.raf(time * 1000);
      updateHeaderTheme();
    };

    gsap.ticker.add(updateTicker);
    gsap.ticker.lagSmoothing(0);

    window.addEventListener("scroll", updateHeaderTheme, { passive: true });
    window.addEventListener("resize", updateHeaderTheme, { passive: true });
    updateHeaderTheme();

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
      window.removeEventListener("scroll", updateHeaderTheme);
      window.removeEventListener("resize", updateHeaderTheme);
      gsap.ticker.remove(updateTicker);
      lenis.destroy();
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, []);

  return (
    <>
      {/* Admin Dashboard Overlay */}
      {currentView === "admin" && (
        <div className="admin-app-wrapper">
          <AdminDashboard
            onClose={() => {
              navigateTo("home");
            }}
          />
        </div>
      )}

      {/* Dedicated Registration Page */}
      {currentView === "register" && (
        <RegistrationPage
          onBack={() => {
            navigateTo("home");
          }}
          onOpenAdmin={() => navigateTo("admin")}
        />
      )}

      {/* Main Club Website View */}
      {currentView === "home" && (
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

          <HeroHeader
            headerRef={heroHeaderRef}
            onNavigateRegister={() => navigateTo("register")}
          />

          {/* Ambient Marquee Ticker */}
          <AmbientTicker text="EST SAFI · ROBOTICS & AI CLUB · EST. 2024 · INNOVATE · BUILD · COMPETE · DISCOVER · AUTONOMOUS SYSTEMS · AI RESEARCH" />

          {/* About Section */}
          <AboutSection />

          {/* Events Section */}
          <EventsSection />

          {/* RAI Section */}
          <RAISection />

          {/* Team Section */}
          <TeamSection />

          {/* Why Join Us Section */}
          <WhyJoinSection onNavigateRegister={() => navigateTo("register")} />

          {/* Partners & Campaigns Section */}
          <PartnersSection />

          {/* Socials Album Section */}
          <SocialsAlbumSection />

          {/* Footer */}
          <Footer
            onOpenAdmin={() => navigateTo("admin")}
            onNavigateRegister={() => navigateTo("register")}
          />
        </div>
      )}

      {/* Vercel Speed Insights for real-time performance monitoring */}
      <SpeedInsights />
    </>
  );
}
