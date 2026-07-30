import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import EventsList from "../EventsList";
import "./EventsSection.css";

gsap.registerPlugin(ScrollTrigger);

export default function EventsSection() {
  const sectionRef = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;

    // track.scrollWidth already includes padding-left: 52vw and padding-right: 200px.
    // x_end = -(scrollWidth - innerWidth) scrolls until the right edge of the track
    // (= right edge of last card + 200px padding-right) aligns with the viewport's right edge.
    const getXEnd = () => -(track.scrollWidth - window.innerWidth);

    // Automatically triggers title typing when an event card's image enters the screen,
    // typing continuously character-by-character without requiring further scrolling.
    const updateTitleReveals = () => {
      const cards = track.querySelectorAll(".event-card-wrapper");
      const winW = window.innerWidth;
      const triggerThreshold = winW * 0.90; // Triggers as soon as card image enters screen

      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const isVisible = rect.left < triggerThreshold && rect.right > 0;

        if (isVisible) {
          if (card.dataset.typingStarted !== "true") {
            card.dataset.typingStarted = "true";

            if (card._typingTimer) clearInterval(card._typingTimer);

            const chars = card.querySelectorAll(".event-title-char");
            const cursor = card.querySelector(".event-typing-cursor");
            const total = chars.length;

            if (total > 0) {
              chars.forEach((c) => (c.style.opacity = "0"));
              if (cursor && chars[0] && chars[0].parentNode) {
                chars[0].insertAdjacentElement("beforebegin", cursor);
                cursor.style.display = "inline-block";
                cursor.style.opacity = "1";
              }

              let currentIndex = 0;
              card._typingTimer = setInterval(() => {
                if (currentIndex < total) {
                  chars[currentIndex].style.opacity = "1";
                  const targetChar = chars[currentIndex];
                  if (targetChar && targetChar.parentNode && cursor) {
                    targetChar.insertAdjacentElement("afterend", cursor);
                    cursor.style.display = "inline-block";
                    cursor.style.opacity = "1";
                  }
                  currentIndex++;
                } else {
                  clearInterval(card._typingTimer);
                  card._typingTimer = null;
                  if (cursor) {
                    cursor.style.display = "none";
                    cursor.style.opacity = "0";
                  }
                }
              }, 45); // Smooth 45ms auto-typing speed per character
            }
          }
        } else if (rect.left >= winW * 0.95) {
          // Card scrolled back off-screen to the right -> reset for re-typing when coming back
          if (card.dataset.typingStarted === "true") {
            if (card._typingTimer) {
              clearInterval(card._typingTimer);
              card._typingTimer = null;
            }
            card.dataset.typingStarted = "false";

            const chars = card.querySelectorAll(".event-title-char");
            const cursor = card.querySelector(".event-typing-cursor");

            chars.forEach((c) => (c.style.opacity = "0"));
            if (cursor && chars[0] && chars[0].parentNode) {
              chars[0].insertAdjacentElement("beforebegin", cursor);
              cursor.style.display = "inline-block";
              cursor.style.opacity = "1";
            }
          }
        }
      });
    };

    // Pin section, scroll gallery items horizontally with smooth physics, and interpolate dark-to-light mode continuously
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        pin: true,
        pinSpacing: true,
        scrub: 1.5,
        start: "top top",
        // Add 500px extra to the scroll distance to compensate for scrub lag at the end
        end: () => `+=${track.scrollWidth - window.innerWidth + 500}`,
        anticipatePin: 1,
        refreshPriority: 1,
        onUpdate: updateTitleReveals,
        onRefresh: updateTitleReveals,
      },
    });

    // Horizontal track glide — stops exactly when the last card is fully in view
    tl.to(
      track,
      {
        x: getXEnd,
        ease: "none",
        duration: 1,
      },
      0
    );

    // Continuous Dark (#0a0e1a) -> 100% Light (#f4f3ee) transition with scroll
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

    // Initial calculation for cards already in viewport
    updateTitleReveals();

    return () => {
      const cards = track.querySelectorAll(".event-card-wrapper");
      cards.forEach((card) => {
        if (card._typingTimer) clearInterval(card._typingTimer);
      });
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, []);

  const handleEventsLoaded = () => {
    ScrollTrigger.refresh();
  };

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
        {/* Supabase Events List */}
        <EventsList onLoaded={handleEventsLoaded} />
      </div>
    </section>
  );
}
