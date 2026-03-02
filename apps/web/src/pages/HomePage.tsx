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
    </div>
  );
}



