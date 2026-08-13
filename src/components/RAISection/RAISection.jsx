import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./RAISection.css";

gsap.registerPlugin(ScrollTrigger);

export default function RAISection() {
  const sectionRef = useRef(null);
  const leftImgRef = useRef(null);
  const rightImgRef = useRef(null);
  const signImgRef = useRef(null);
  const leftTextRef = useRef(null);
  const rightTextRef = useRef(null);

  useEffect(() => {
    const section = sectionRef.current;
    const leftImg = leftImgRef.current;
    const rightImg = rightImgRef.current;
    const leftText = leftTextRef.current;
    const rightText = rightTextRef.current;

    if (!section || !leftImg || !rightImg || !leftText || !rightText) return;

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top 85%",
        end: "center center",
        scrub: 1.2,
      },
    });

    // Left image starts at top-left, moves to center on scroll
    tl.fromTo(
      leftImg,
      {
        x: "-30vw",
        y: "-15vh",
        opacity: 1,
      },
      {
        x: "0vw",
        y: "0vh",
        opacity: 1,
        ease: "none",
      },
      0
    );

    // Left text (ROBO & AND) moves from left to center in sync with left image
    tl.fromTo(
      leftText,
      {
        x: "-30vw",
        y: "-15vh",
        opacity: 1,
      },
      {
        x: "0vw",
        y: "0vh",
        opacity: 1,
        ease: "none",
      },
      0
    );

    // Right image starts at top-right, moves to center on scroll
    tl.fromTo(
      rightImg,
      {
        x: "30vw",
        y: "-15vh",
        opacity: 1,
      },
      {
        x: "0vw",
        y: "0vh",
        opacity: 1,
        ease: "none",
      },
      0
    );

    // Right text (TICS & AI) moves from right to center in sync with right image
    tl.fromTo(
      rightText,
      {
        x: "30vw",
        y: "-15vh",
        opacity: 1,
      },
      {
        x: "0vw",
        y: "0vh",
        opacity: 1,
        ease: "none",
      },
      0
    );

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, []);

  return (
    <section id="rai" className="rai-section" ref={sectionRef}>
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

      <div className="rai-container">
        <img
          ref={leftImgRef}
          src="/RAI/RIA-LS.png"
          alt="RAI Left Side"
          className="rai-side-img rai-left-img"
        />

        {/* Center Split Text Overlay */}
        <div className="rai-text-center-wrapper">
          <div ref={leftTextRef} className="rai-text-half rai-text-left-half">
            <div className="rai-text-row">
              <span className="rai-word-part">ROBO</span>
            </div>
            <div className="rai-text-row">
              <span className="rai-word-part rai-word-blue">AND&nbsp;</span>
            </div>
          </div>
          <div ref={rightTextRef} className="rai-text-half rai-text-right-half">
            <div className="rai-text-row">
              <span className="rai-word-part rai-word-blue">TICS</span>
            </div>
            <div className="rai-text-row">
              <span className="rai-word-part">AI</span>
            </div>
          </div>
        </div>

        <img
          ref={rightImgRef}
          src="/RAI/RAI-RS.png"
          alt="RAI Right Side"
          className="rai-side-img rai-right-img"
        />
      </div>
    </section>
  );
}
