import { usePageTitle } from "../hooks/usePageTitle";
import "./TaxiDraft.css";

export default function TaxiDraft() {
  usePageTitle("Taxi Draft");

  return (
    <div className="taxi-draft-page">
      <div className="taxi-draft-shell">
        <header className="taxi-draft-header">
          <div>
            <h1>Taxi Draft</h1>
            <p>
              Set taxi draft order, assign eligible players, and manage taxi rosters.
            </p>
          </div>
        </header>

        <div className="taxi-draft-grid">
          <section className="taxi-draft-card">
            <div className="taxi-draft-card-label">Taxi Draft Order</div>
            <div className="taxi-draft-card-body">
              Placeholder for taxi draft order.
            </div>
          </section>

          <section className="taxi-draft-card">
            <div className="taxi-draft-card-label">Add Player to Taxi Roster</div>
            <div className="taxi-draft-card-body">
              Placeholder for assigning eligible players to a taxi roster.
            </div>
          </section>

          <section className="taxi-draft-card taxi-draft-card--wide">
            <div className="taxi-draft-card-label">Taxi Rosters by Team</div>
            <div className="taxi-draft-card-body">
              Placeholder for the team-level taxi roster summaries.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
