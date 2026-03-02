import "./PhasesSection.css";


interface Phase {
  number: string;
  title: string;
  description: string;
}

const phases: Phase[] = [
  {
    number: "01",
    title: "Research",
    description:
      "Browse 300+ players. Build watchlists. Compare category contributions. Set personal rankings.",
  },
  {
    number: "02",
    title: "Strategize",
    description:
      "Define your budget allocation. Prioritize positions. Map your category targets. Plan your endgame.",
  },
  {
    number: "03",
    title: "Execute",
    description:
      "Command Center for live draft. Track every pick. Monitor scarcity. Adjust in real-time. Win.",
  },
];

export default function PhasesSection() {
  return (
    <section className="phases-section">
      <h2 className="phases-heading">Three Phases. One Engine.</h2>
      <div className="phases-list">
        {phases.map((phase: Phase, i: number) => (
          <div
            className="phase-item"
            key={i}
            style={{ animationDelay: `${i * 0.15}s` }}
          >
            <div className="phase-divider" />
            <div className="phase-content">
              <span className="phase-number">{phase.number}</span>
              <div className="phase-text">
                <h3 className="phase-title">{phase.title}</h3>
                <p className="phase-desc">{phase.description}</p>
              </div>
            </div>
          </div>
        ))}
        <div className="phase-divider" />
      </div>
    </section>
  );
}