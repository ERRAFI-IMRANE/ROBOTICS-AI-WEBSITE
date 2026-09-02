import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./AboutSection.css";

gsap.registerPlugin(ScrollTrigger);

const WORDS = [
  { text: "We're", isEmphasized: false },
  { text: "a", isEmphasized: false },
  { text: "community", isEmphasized: false },
  { text: "of", isEmphasized: false },
  { text: "students", isEmphasized: false },
  { text: "passionate", isEmphasized: false },
  { text: "about", isEmphasized: false },
  { text: "technology,", isEmphasized: true },
  { text: "robotics,", isEmphasized: false },
  { text: "and", isEmphasized: false },
  { text: "artificial", isEmphasized: true },
  { text: "intelligence.", isEmphasized: true },
  { text: "Join", isEmphasized: false },
  { text: "us", isEmphasized: false },
  { text: "to", isEmphasized: false },
  { text: "learn,", isEmphasized: false },
  { text: "build,", isEmphasized: false },
  { text: "and", isEmphasized: false },
  { text: "innovate", isEmphasized: true },
  { text: "together.", isEmphasized: false },
];

export default function AboutSection() {
  const sectionRef = useRef(null);
  const wordsRef = useRef([]);

  useEffect(() => {
    const wordEls = wordsRef.current.filter(Boolean);
    const section = sectionRef.current;
    if (!wordEls.length || !section) return;

    // Check reduced motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      wordEls.forEach((el) => {
        el.classList.add("is-lit");
      });
      return;
    }

    // Separate standard words vs emphasized words for progressive payoff timing
    const standardIndices = [];
    const emphasizedIndices = [];
    WORDS.forEach((w, i) => {
      if (w.isEmphasized) {
        emphasizedIndices.push(i);
      } else {
        standardIndices.push(i);
      }
    });

    const trigger = ScrollTrigger.create({
      trigger: section,
      start: "top 75%",
      end: "+=650",
      scrub: true,
      refreshPriority: 2,
      onUpdate: (self) => {
        const p = self.progress;

        // 1. Standard words light up progressively from progress 0.05 to 0.72
        standardIndices.forEach((wIdx, rank) => {
          const threshold = 0.05 + (rank / (standardIndices.length - 1 || 1)) * 0.65;
          const el = wordEls[wIdx];
          if (el) {
            if (p >= threshold) {
              el.classList.add("is-lit");
            } else {
              el.classList.remove("is-lit");
            }
          }
        });

        // 2. Emphasized words light up last as the payoff (progress 0.72 to 0.98)
        emphasizedIndices.forEach((wIdx, rank) => {
          const threshold = 0.72 + (rank / (emphasizedIndices.length - 1 || 1)) * 0.25;
          const el = wordEls[wIdx];
          if (el) {
            if (p >= threshold) {
              el.classList.add("is-lit");
            } else {
              el.classList.remove("is-lit");
            }
          }
        });
      },
    });

    return () => {
      trigger.kill();
    };
  }, []);

  return (
    <section id="about" className="about-section" ref={sectionRef}>
      <div className="about-container">
        <blockquote className="about-h1-text">
          {WORDS.map((item, i) => (
            <span
              key={i}
              ref={(el) => {
                wordsRef.current[i] = el;
              }}
              className={`about-scrub-word ${item.isEmphasized ? "about-word--emphasized" : "about-word--standard"}`}
            >
              {item.text}
              {i < WORDS.length - 1 ? " " : ""}
            </span>
          ))}
        </blockquote>
      </div>
    </section>
  );
}

