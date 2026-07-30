import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./AboutSection.css";

gsap.registerPlugin(ScrollTrigger);

// Each word: { text, color }
const WORDS = [
  { text: "We're", color: "white" },
  { text: "a", color: "white" },
  { text: "community", color: "white" },
  { text: "of", color: "white" },
  { text: "students", color: "white" },
  { text: "passionate", color: "white" },
  { text: "about", color: "white" },
  { text: "technology,", color: "blue" },
  { text: "robotics,", color: "white" },
  { text: "and", color: "white" },
  { text: "artificial", color: "blue" },
  { text: "intelligence.", color: "blue" },
  { text: "Join", color: "white" },
  { text: "us", color: "white" },
  { text: "to", color: "white" },
  { text: "learn,", color: "white" },
  { text: "build,", color: "white" },
  { text: "and", color: "white" },
  { text: "innovate", color: "blue" },
  { text: "together.", color: "white" },
];

export default function AboutSection() {
  const sectionRef = useRef(null);
  const cursorRef = useRef(null);
  const charsRef = useRef([]);

  useEffect(() => {
    const chars = charsRef.current.filter(Boolean);
    const cursor = cursorRef.current;
    if (!chars.length || !cursor) return;

    // Start all chars invisible initially
    chars.forEach((c) => {
      c.style.opacity = "0";
    });

    const trigger = ScrollTrigger.create({
      trigger: sectionRef.current,
      start: "top 75%",
      end: "+=650",
      scrub: 1.5,
      refreshPriority: 2,
      onUpdate: (self) => {
        const total = chars.length;
        const count = Math.round(self.progress * total);

        for (let i = 0; i < total; i++) {
          if (i < count) {
            chars[i].style.opacity = "1";
          } else {
            chars[i].style.opacity = "0";
          }
        }

        if (count > 0 && count <= total) {
          const targetChar = chars[count - 1];
          if (targetChar && targetChar.parentNode) {
            targetChar.insertAdjacentElement("afterend", cursor);
            cursor.style.display = "inline-block";
          }
        } else if (count === 0) {
          if (chars[0] && chars[0].parentNode) {
            chars[0].insertAdjacentElement("beforebegin", cursor);
            cursor.style.display = "inline-block";
          }
        }
      },
    });

    return () => {
      trigger.kill();
    };
  }, []);

  return (
    <section id="about" className="about-section" ref={sectionRef}>
      <div className="about-container">
        <h1 className="about-h1-text">
          {WORDS.map((word, wi) => {
            const wordOffset = WORDS.slice(0, wi).reduce(
              (acc, w) => acc + w.text.length + 1,
              0
            );

            return (
              <span key={wi} className={`about-word about-${word.color}`}>
                {word.text.split("").map((char, ci) => (
                  <span
                    key={ci}
                    className="about-char"
                    ref={(el) => {
                      charsRef.current[wordOffset + ci] = el;
                    }}
                  >
                    {char}
                  </span>
                ))}
                {wi < WORDS.length - 1 && (
                  <span
                    className="about-char"
                    ref={(el) => {
                      charsRef.current[wordOffset + word.text.length] = el;
                    }}
                  >
                    {" "}
                  </span>
                )}
              </span>
            );
          })}
          <span ref={cursorRef} className="typing-cursor" aria-hidden="true" />
        </h1>
      </div>
    </section>
  );
}
