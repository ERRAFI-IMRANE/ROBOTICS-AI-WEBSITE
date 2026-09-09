import { useCallback, useState, useEffect, useRef } from "react";
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
import SiteLoader from "./components/common/SiteLoader";
import AdminDashboard from "./components/Admin/AdminDashboard";
import RegistrationPage from "./components/RegistrationPage/RegistrationPage";
import { publicContent, supabase } from "./lib/supabaseClient";
import { loadPublicWebsite } from "./lib/publicWorkspace";
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
  const [websiteData, setWebsiteData] = useState(null);
  const [heroReady, setHeroReady] = useState(false);
  const [siteLoad, setSiteLoad] = useState(() => ({
    phase: currentView === "home" ? "loading" : "idle",
    progress: 0,
    stage: "Starting club systems",
  }));

  const heroWrapperRef = useRef(null);
  const heroInnerRef = useRef(null);
  const heroHeaderRef = useRef(null);
  const darkOverlayRef = useRef(null);

  useEffect(() => {
    if (currentView !== "home" || websiteData) return;
    let active = true;

    setSiteLoad({ phase: "loading", progress: 2, stage: "Starting club systems" });
    setHeroReady(false);
    loadPublicWebsite(publicContent, supabase, (next) => {
      if (active) setSiteLoad((current) => ({ ...current, ...next, phase: "loading" }));
    })
      .catch((error) => {
        console.warn("The public preload completed with fallback data:", error);
        return { team: [], events: [], settings: null, season: "25-26" };
      })
      .then((dataset) => {
        if (!active) return;
        setWebsiteData(dataset);
        setSiteLoad({ phase: "rendering", progress: 99, stage: "Preparing hero" });
      });

    return () => {
      active = false;
    };
  }, [currentView, websiteData]);

  const handleHeroReady = useCallback(() => {
    setHeroReady(true);
  }, []);

  useEffect(() => {
    if (currentView !== "home" || !websiteData || !heroReady || siteLoad.phase !== "rendering") return;
    setSiteLoad({ phase: "exiting", progress: 100, stage: "Ready" });
  }, [currentView, heroReady, siteLoad.phase, websiteData]);

  useEffect(() => {
    if (siteLoad.phase !== "exiting") return;
    const exitTimer = window.setTimeout(() => {
      setSiteLoad({ phase: "done", progress: 100, stage: "Ready" });
    }, 840);
    return () => window.clearTimeout(exitTimer);
  }, [siteLoad.phase]);

  useEffect(() => {
    const loaderVisible = currentView === "home" && siteLoad.phase !== "done";
    if (!loaderVisible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [currentView, siteLoad.phase]);

  const navigateTo = (view) => {
    // A query route must not override the next hash route or the return-home action.
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    url.hash = view === "home" ? "" : view;
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: "instant" });
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
      prevent: (node) => Boolean(node.closest('[role="dialog"]')),
    });

    const whyJoinEl = document.getElementById("why-join");
    const teamEl = document.getElementById("team");
    const raiEl = document.getElementById("rai");
    const eventsEl = document.getElementById("events");
    let lastTheme = "";
    let themeFrame = 0;
    const setHeaderTheme = (theme) => {
      if (theme === lastTheme) return;
      lastTheme = theme;
      header.classList.toggle("btn-is-black", theme === "light");
      header.classList.toggle("is-dark", theme === "dark");
    };

    // Dynamic 3-dash button & header theme coordinator matching user section specifications
    const updateHeaderTheme = () => {
      const headerOffset = 65;

      // 1. After team section until the end of the page (WhyJoin, Partners, Socials, Footer) -> BLACK
      if (whyJoinEl && whyJoinEl.getBoundingClientRect().top <= headerOffset) {
        setHeaderTheme("light");
        return;
      }

      // 2. Team section (dark #0c0d12 background) -> WHITE
      if (teamEl && teamEl.getBoundingClientRect().top <= headerOffset) {
        setHeaderTheme("dark");
        return;
      }

      // 3. Img slide section (RAI - light #f4f3ee background) -> BLACK
      if (raiEl && raiEl.getBoundingClientRect().top <= headerOffset) {
        setHeaderTheme("light");
        return;
      }

      // 4. Event section with scroll -> BLACK once background becomes light in events, otherwise WHITE
      if (eventsEl && eventsEl.getBoundingClientRect().top <= headerOffset) {
        const isEventsScrolledLight = eventsEl.dataset.scrolledLight === "true";
        if (isEventsScrolledLight) {
          setHeaderTheme("light");
        } else {
          setHeaderTheme("dark");
        }
        return;
      }

      // 5. Before event section (Hero until event section) -> WHITE
      setHeaderTheme("dark");
    };

    const scheduleHeaderTheme = () => {
      if (themeFrame) return;
      themeFrame = requestAnimationFrame(() => {
        themeFrame = 0;
        updateHeaderTheme();
      });
    };

    lenis.on("scroll", () => {
      ScrollTrigger.update();
      scheduleHeaderTheme();
    });

    const updateTicker = (time) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(updateTicker);
    gsap.ticker.lagSmoothing(0);

    window.addEventListener("scroll", scheduleHeaderTheme, { passive: true });
    window.addEventListener("resize", scheduleHeaderTheme, { passive: true });
    window.addEventListener("rai:theme-change", scheduleHeaderTheme);
    updateHeaderTheme();

    // Keep the cinematic pinned transition on desktop. Mobile uses a shorter,
    // native-scrolling hero so content is immediate and touch scrolling stays fluid.
    let tl = null;
    if (!window.matchMedia("(max-width: 767px)").matches) {
      tl = gsap.timeline({
        scrollTrigger: {
          trigger: wrapper,
          start: "top top",
          end: "+=120%",
          scrub: 0.8,
          pin: true,
          pinSpacing: true,
          anticipatePin: 1,
          refreshPriority: 3,
        },
      });

      tl.to(inner, {
        scale: 0.52,
        opacity: 1,
        borderRadius: "0px",
        ease: "none",
        duration: 1,
      });

      tl.to(darkOverlay, {
        opacity: 0.76,
        ease: "none",
        duration: 1,
      }, 0);
    }

    let active = true;
    const refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
    document.fonts.ready.then(() => { if (active) ScrollTrigger.refresh(); });
    return () => {
      active = false;
      cancelAnimationFrame(refreshFrame);
      cancelAnimationFrame(themeFrame);
      window.removeEventListener("scroll", scheduleHeaderTheme);
      window.removeEventListener("resize", scheduleHeaderTheme);
      window.removeEventListener("rai:theme-change", scheduleHeaderTheme);
      gsap.ticker.remove(updateTicker);
      lenis.destroy();
      tl?.scrollTrigger?.kill();
      tl?.kill();
    };
  }, [currentView, websiteData]);

  useEffect(() => {
    if (currentView !== "home" || siteLoad.phase !== "done") return;
    const refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(refreshFrame);
  }, [currentView, siteLoad.phase]);

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
      {currentView === "home" && websiteData && (
        <div className={`app-scroll-container ${["exiting", "done"].includes(siteLoad.phase) ? "site-content-ready" : ""}`}>
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
              <HeroSection onReady={handleHeroReady} />
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
          <EventsSection initialEvents={websiteData.events} />

          {/* RAI Section */}
          <RAISection />

          {/* Team Section */}
          <TeamSection initialTeam={websiteData.team} initialSeason={websiteData.season} />

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

      {currentView === "home" && siteLoad.phase !== "done" && (
        <SiteLoader phase={siteLoad.phase} progress={siteLoad.progress} stage={siteLoad.stage} />
      )}

      {/* Vercel Speed Insights for real-time performance monitoring */}
      <SpeedInsights />
    </>
  );
}
