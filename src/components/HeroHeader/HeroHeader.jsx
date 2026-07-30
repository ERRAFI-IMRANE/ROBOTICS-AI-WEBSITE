export default function HeroHeader({ headerRef }) {
  return (
    <header ref={headerRef} className="hero-transition-header">
      <div className="header-left">
        <a href="/" className="nav-brand-link" aria-label="RAI Robotics Home">
          <img src="RAI/club-icon-light.png" alt="RAI Robotics Logo" height={70} className="nav-brand-logo" />
        </a>
      </div>

      <div className="header-right">
        <a href="#login" className="btn-login">Log in</a>
        <button className="btn-book-demo" type="button">
          <span>Book a Demo</span>
          <svg className="icon-arrow-up-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="7" y1="17" x2="17" y2="7" />
            <polyline points="7 7 17 7 17 17" />
          </svg>
        </button>
      </div>
    </header>
  );
}

