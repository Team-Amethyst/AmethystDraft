import { BarChart2, Target, Shield } from "lucide-react";
import "./FeatureCards.css";
import type { JSX } from "react/jsx-dev-runtime";

interface Feature {
  icon: JSX.Element;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: <BarChart2 size={22} />,
    title: "Category Balance",
    description:
      "5×5 roto category tracking across R, HR, RBI, SB, AVG, W, K, ERA, WHIP, DH. See exactly how each pick shifts your standings.",
  },
  {
    icon: <Target size={22} />,
    title: "Scarcity Engine",
    description:
      "Position-specific replacement values. Catcher premium, closer volatility, and MI scarcity tracked in real-time.",
  },
  {
    icon: <Shield size={22} />,
    title: "Budget Discipline",
    description:
      "Hitter/pitcher allocation tracking with 70/30 default split. Never lose your auction to budget mismanagement.",
  },
];

export default function FeatureCards(): JSX.Element {
  return (
    <section className="features-section">
      <h2 className="features-heading">Draft Day Weapons</h2>
      <div className="features-grid">
        {features.map((f: Feature, i: number) => (
          <div
            className="feature-card"
            key={i}
            style={{ animationDelay: `${i * 0.12}s` }}
          >
            <div className="feature-icon">{f.icon}</div>
            <h3 className="feature-title">{f.title}</h3>
            <p className="feature-desc">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
