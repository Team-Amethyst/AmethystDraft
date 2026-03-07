import { useNavigate } from "react-router";
import "./HeroSection.css";
import type { JSX } from "react/jsx-dev-runtime";

export default function HeroSection(): JSX.Element {
  const navigate = useNavigate();

  return (
    <section className="hero">
      <div className="hero-bg" />
      <div className="hero-content">
        <p className="hero-eyebrow">FANTASY DRAFT INTELLIGENCE PLATFORM</p>
        <h1 className="hero-title">
          Draft Smarter.
          <br />
          <span className="hero-title-accent">Win Bigger.</span>
        </h1>
        <p className="hero-subtitle">
          Amethyst gives you real-time budget intelligence, market-adjusted
          valuations, and AI-powered draft recommendations — all in one command
          center.
        </p>
        <div className="hero-cta">
          <button className="cta-primary" onClick={() => navigate("/signup")}>
            Get Started
          </button>
          <button className="cta-outline">View Rankings</button>
        </div>
      </div>
    </section>
  );
}
