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
  const swipeWrapperRef = useRef(null);

  useEffect(() => {
    const section = sectionRef.current;
    const leftImg = leftImgRef.current;
    const rightImg = rightImgRef.current;
    const leftText = leftTextRef.current;
    const rightText = rightTextRef.current;
    const swipeWrapper = swipeWrapperRef.current;

    if (!section || !leftImg || !rightImg || !leftText || !rightText) return;

    // Original RAI section animation — untouched
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

    // Swipe animation: triggers immediately when RAI finishes (at center center), sticking the section in place while the image swipes up
    let swipeTl;
    if (swipeWrapper) {
      swipeTl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "center center",
          end: "+=100%",
          pin: true,
          pinSpacing: true,
          scrub: 1,
          anticipatePin: 1,
        },
      });

      swipeTl.fromTo(
        swipeWrapper,
        {
          yPercent: 100,
        },
        {
          yPercent: 0,
          ease: "none",
        }
      );
    }

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
      swipeTl?.scrollTrigger?.kill();
      swipeTl?.kill();
    };
  }, []);

  return (
    <section id="rai" className="rai-section" ref={sectionRef}>
      {/* Topographic Contour Line Background Pattern */}
      <div className="topographic-bg" aria-hidden="true">
        <svg viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
          <path
            className="topo-path topo-path-1"
            d="M-100,200 C300,100 600,400 900,200 C1200,0 1500,300 1800,150"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeDasharray="8 8"
          />
          <path
            className="topo-path topo-path-2"
            d="M-100,450 C250,300 550,600 950,350 C1250,150 1550,500 1850,300"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            className="topo-path topo-path-3"
            d="M-100,700 C350,550 650,800 1050,600 C1350,400 1650,750 1950,550"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeDasharray="10 10"
          />
          <path
            className="topo-path topo-path-4"
            d="M-100,320 C320,480 620,180 1020,420 C1320,620 1620,280 1920,480"
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
            <div className="rai-subtext-row rai-subtext-first">
              <h4 className="rai-subtext-part">We’re a community of students pas</h4>
            </div>
            <div className="rai-subtext-row">
              <h4 className="rai-subtext-part">and artificial intelligence. Join us to&nbsp;</h4>
            </div>
            <div className="rai-btn-row rai-btn-row-left">
              <a href="#join" className="rai-btn rai-btn-primary">
                <span>Join Community</span>
                <svg className="rai-btn-arrow" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </a>
            </div>
          </div>
          <div ref={rightTextRef} className="rai-text-half rai-text-right-half">
            <div className="rai-text-row">
              <span className="rai-word-part rai-word-blue">TICS</span>
            </div>
            <div className="rai-text-row">
              <span className="rai-word-part">AI</span>
            </div>
            <div className="rai-subtext-row rai-subtext-first">
              <h4 className="rai-subtext-part">sionate about technology, robotics,</h4>
            </div>
            <div className="rai-subtext-row">
              <h4 className="rai-subtext-part">learn, build, and innovate together.</h4>
            </div>
            <div className="rai-btn-row rai-btn-row-right">
              <a href="#events" className="rai-btn rai-btn-primary">
                <span>Explore Events</span>
                <svg className="rai-btn-arrow" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </a>
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

      {/* Full-screen swipe-up image overlay */}
      <div ref={swipeWrapperRef} className="rai-swipe-wrapper">
        <img
          src="/Bg-swip.png"
          alt="Campus Swipe"
          className="rai-swipe-img"
          loading="eager"
        />
      </div>
    </section>
  );
}
