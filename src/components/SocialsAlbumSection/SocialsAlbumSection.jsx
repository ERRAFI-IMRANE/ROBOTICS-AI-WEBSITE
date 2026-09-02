import { useState } from "react";
import { RevealHeadingLine } from "../common/TextAnimations";
import "./SocialsAlbumSection.css";

const ALBUM_PHOTOS = [
  {
    id: 1,
    title: "Club Milestone 1",
    src: "/album/1.jpg",
    alt: "Robotics & AI Club Photo 1",
    link: "https://www.instagram.com/robotics_aiclub.ests/",
  },
  {
    id: 2,
    title: "Club Milestone 2",
    src: "/album/2.JPG",
    alt: "Robotics & AI Club Photo 2",
    link: "https://www.instagram.com/robotics_aiclub.ests/",
  },
  {
    id: 3,
    title: "Club Milestone 3",
    src: "/album/3.jpg",
    alt: "Robotics & AI Club Photo 3",
    link: "https://www.instagram.com/robotics_aiclub.ests/",
  },
  {
    id: 4,
    title: "Club Milestone 4",
    src: "/album/4.jpg",
    alt: "Robotics & AI Club Photo 4",
    link: "https://www.instagram.com/robotics_aiclub.ests/",
  },
  {
    id: 5,
    title: "Club Milestone 5",
    src: "/album/5.jpg",
    alt: "Robotics & AI Club Photo 5",
    link: "https://www.instagram.com/robotics_aiclub.ests/",
  },
  {
    id: 6,
    title: "Club Milestone 6",
    src: "/album/6.jpg",
    alt: "Robotics & AI Club Photo 6",
    link: "https://www.instagram.com/robotics_aiclub.ests/",
  },
  {
    id: 7,
    title: "Club Milestone 7",
    src: "/album/7.jpg",
    alt: "Robotics & AI Club Photo 7",
    link: "https://www.instagram.com/robotics_aiclub.ests/",
  },
];

const SOCIAL_LINKS = [
  { name: "INSTAGRAM", url: "https://www.instagram.com/robotics_aiclub.ests/" },
  { name: "LINKEDIN", url: "https://www.linkedin.com/in/robotics-ai-club/" },
  { name: "TIKTOK", url: "https://www.tiktok.com/@robotics.ai.club" },
  { name: "DISCORD", url: "https://discord.gg/GdDsZjJTF" },
];

export default function SocialsAlbumSection() {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  return (
    <section id="socials" className="socials-album-section">
      <div className="socials-album-container">
        {/* Top Header: Club Logo + What's Up On Socials */}
        <div className="socials-album-header">
          <div className="socials-club-logo-wrap">
            <img
              src="/RAI/club-icon-light.png"
              alt="Robotics & AI Club Logo"
              className="socials-club-logo-img"
              loading="lazy"
            />
          </div>
          <h2 className="socials-album-heading">
            <RevealHeadingLine delay={0} className="socials-heading-sans">
              WHAT&apos;S UP
            </RevealHeadingLine>
            <RevealHeadingLine delay={100} className="socials-heading-serif">
              ON SOCIALS
            </RevealHeadingLine>
          </h2>
        </div>

        {/* 7-Card Fanned Picture Deck */}
        <div className="socials-album-deck" aria-label="Social media photo album">
          {ALBUM_PHOTOS.map((photo, idx) => {
            const isHovered = hoveredIdx === idx;
            return (
              <a
                key={photo.id}
                href={photo.link}
                target="_blank"
                rel="noopener noreferrer"
                className={`socials-album-card socials-card-pos-${idx} ${isHovered ? "is-selected" : ""}`}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                onFocus={() => setHoveredIdx(idx)}
                onBlur={() => setHoveredIdx(null)}
                aria-label={photo.title}
              >
                <div className="socials-card-media-wrap">
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    className="socials-card-img"
                    loading="lazy"
                    onError={(e) => {
                      const cur = e.currentTarget.src;
                      if (cur.endsWith(".jpg")) {
                        e.currentTarget.src = cur.replace(/\.jpg$/, ".JPG");
                      } else if (cur.endsWith(".JPG")) {
                        e.currentTarget.src = cur.replace(/\.JPG$/, ".jpg");
                      } else if (cur.endsWith(".png")) {
                        e.currentTarget.src = cur.replace(/\.png$/, ".PNG");
                      }
                    }}
                  />
                  <div className="socials-card-overlay" />
                </div>
              </a>
            );
          })}
        </div>

        {/* Bottom Area: Follow Title & Social Links */}
        <div className="socials-album-footer">
          <p className="socials-follow-prompt">
            Follow RAI on social media
          </p>

          <nav className="socials-links-row" aria-label="Social media channels">
            {SOCIAL_LINKS.map((item) => (
              <a
                key={item.name}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="social-channel-link anim-link-underline"
              >
                {item.name}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </section>
  );
}
