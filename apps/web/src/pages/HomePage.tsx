import Navbar from "../components/Navbar";
import FeatureCards from "../components/FeatureCards";
import "./HomePage.css";
import type { JSX } from "react/jsx-dev-runtime";
import HeroSection from "../components/HeroSection";
import PhasesSection from "../components/PhasesSection";

export default function HomePage(): JSX.Element {
  return (
    <div className="home-page">
      <Navbar />
      <HeroSection />
      <FeatureCards />
      <PhasesSection />

      {/* ── Footer ── */}
      <footer className="home-footer">
        <div className="home-footer-engine">
          <span className="home-footer-label">Powered by</span>
          <a
            href="https://q6dbuvmuvh.us-east-1.awsapprunner.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="home-footer-engine-link"
          >
            <span className="home-footer-zap">⚡</span>
            Amethyst Engine
          </a>
          <span className="home-footer-divider">·</span>
          <span className="home-footer-copy">
            © {new Date().getFullYear()} Amethyst Industries
          </span>
        </div>
      </footer>
    </div>
  );
}
