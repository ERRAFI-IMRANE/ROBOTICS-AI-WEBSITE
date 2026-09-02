import { useState } from "react";
import { RevealHeadingLine } from "../common/TextAnimations";
import "./PartnersSection.css";

const PARTNERS = [
  {
    id: "ests",
    name: "École Supérieure de Technologie de Safi",
    shortName: "EST Safi",
    logo: "/partners/estsLight.png",
    url: "https://ests.uca.ma",
  },
  {
    id: "uca",
    name: "Université Cadi Ayyad",
    shortName: "UCA Marrakech",
    logo: "/partners/ucaLight.png",
    url: "https://uca.ma",
  },
  {
    id: "a4c",
    name: "AI For Climate Initiative",
    shortName: "A4C Africa",
    logo: "/partners/a4cLight.png",
    url: "https://a4c.ma",
  },
  {
    id: "ocp",
    name: "OCP Group",
    shortName: "OCP",
    logo: "/partners/OCP.png",
    textFallback: "OCP",
    url: "#partners",
  },
  {
    id: "renault",
    name: "Renault Group",
    shortName: "Renault",
    logo: "/partners/Renault.png",
    textFallback: "Renault",
    url: "#partners",
  },
  {
    id: "gps",
    name: "GPS",
    shortName: "GPS",
    logo: "/partners/GPS.png",
    textFallback: "GPS",
    url: "#partners",
  },
];

export default function PartnersSection() {
  const [imgErrors, setImgErrors] = useState({});

  const handleImageError = (id) => {
    setImgErrors((prev) => ({ ...prev, [id]: true }));
  };

  // Repeat partner items for a continuous, seamless infinite loop scroll
  const loopList = [
    ...PARTNERS,
    ...PARTNERS,
    ...PARTNERS,
    ...PARTNERS,
  ];

  return (
    <section id="partners" className="partners-section">
      {/* Dynamic Overlaid Club Sign (in place of yellow collab sign) */}
      <div className="partners-club-sign-backdrop" aria-hidden="true">
        <img
          src="/RAI/club sign.png"
          alt="Robotics & AI Club Sign"
          className="partners-club-sign-img"
          loading="lazy"
        />
      </div>

      <div className="partners-content-wrap">
        {/* Top Header Split: Bold Title on Left, Narrative Paragraph on Right */}
        <div className="partners-header-grid">
          <div className="partners-title-block">
            <h2 className="partners-main-heading">
              <RevealHeadingLine delay={0} className="partners-title-sans">
                PARTNERS
              </RevealHeadingLine>
              <RevealHeadingLine delay={100} className="partners-title-serif">
                &amp; COLLABORATORS
              </RevealHeadingLine>
            </h2>
          </div>

          <div className="partners-narrative-block">
            <p className="partners-narrative-text">
              Robotics &amp; AI Club is proud to collaborate with a range of academic, industrial, and technology partners who share our passion for robotics engineering, artificial intelligence, and youth innovation.
            </p>
          </div>
        </div>

        {/* Bottom Horizontal Infinite Loop Scroll */}
        <div className="partners-marquee-container" aria-label="Our partners and collaborators">
          <div className="partners-marquee-track">
            {loopList.map((partner, idx) => {
              const uniqueKey = `${partner.id}-${idx}`;
              const hasError = imgErrors[uniqueKey] || imgErrors[partner.id];

              return (
                <a
                  key={uniqueKey}
                  href={partner.url || "#partners"}
                  target={partner.url && partner.url !== "#partners" ? "_blank" : undefined}
                  rel={partner.url && partner.url !== "#partners" ? "noopener noreferrer" : undefined}
                  className="partner-item-card"
                  title={partner.name}
                  onClick={(e) => {
                    if (!partner.url || partner.url === "#partners") {
                      e.preventDefault();
                    }
                  }}
                >
                  {!hasError && partner.logo ? (
                    <img
                      src={partner.logo}
                      alt={partner.name}
                      className="partner-logo-img"
                      loading="lazy"
                      onError={() => handleImageError(uniqueKey)}
                    />
                  ) : (
                    <span className="partner-text-badge">
                      {partner.textFallback || partner.shortName || partner.name}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
