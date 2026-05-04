import { useEffect, useMemo, useState } from "react";
import { useLeague } from "../contexts/LeagueContext";
import { usePageTitle } from "../hooks/usePageTitle";
import {
  initializeTaxiDraftOrder,
  moveTaxiDraftOrderTeamDown,
  moveTaxiDraftOrderTeamUp,
} from "../domain/taxiDraft";
import {
  loadTaxiDraftState,
  saveTaxiDraftState,
} from "../utils/taxiDraftPersistence";
import "./TaxiDraft.css";

export default function TaxiDraft() {
  usePageTitle("Taxi Draft");

  const { league } = useLeague();
  const leagueTeamNames = useMemo(() => {
    if (!league) return [];
    if (league.teamNames?.length) return league.teamNames;
    return Array.from({ length: league.teams }, (_, i) => `Team ${i + 1}`);
  }, [league]);

  const [taxiDraftOrder, setTaxiDraftOrder] = useState<string[]>([]);

  useEffect(() => {
    if (!league) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTaxiDraftOrder([]);
      return;
    }

    const savedState = loadTaxiDraftState(league.id);
    if (savedState?.taxiDraftOrder?.length) {
      setTaxiDraftOrder(savedState.taxiDraftOrder);
      return;
    }

    setTaxiDraftOrder(initializeTaxiDraftOrder(leagueTeamNames));
  }, [league, leagueTeamNames]);

  useEffect(() => {
    if (!league) return;
    saveTaxiDraftState(league.id, {
      taxiDraftOrder,
      taxiRosters: {},
    });
  }, [league, taxiDraftOrder]);

  const handleMoveUp = (teamName: string) => {
    setTaxiDraftOrder((current) => moveTaxiDraftOrderTeamUp(current, teamName));
  };

  const handleMoveDown = (teamName: string) => {
    setTaxiDraftOrder((current) => moveTaxiDraftOrderTeamDown(current, teamName));
  };

  const handleResetOrder = () => {
    setTaxiDraftOrder(initializeTaxiDraftOrder(leagueTeamNames));
  };

  const handleReverseOrder = () => {
    setTaxiDraftOrder((current) => [...current].reverse());
  };

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
            <div className="taxi-draft-card-body taxi-draft-order-body">
              {league ? (
                <div className="taxi-draft-order-wrapper">
                  <div className="taxi-draft-order-toolbar">
                    <button
                      type="button"
                      className="taxi-draft-button taxi-draft-button--secondary"
                      onClick={handleResetOrder}
                      disabled={
                        taxiDraftOrder.length === 0 ||
                        taxiDraftOrder.every((team, index) => team === leagueTeamNames[index])
                      }
                    >
                      Reset to League Order
                    </button>
                    <button
                      type="button"
                      className="taxi-draft-button taxi-draft-button--secondary"
                      onClick={handleReverseOrder}
                      disabled={taxiDraftOrder.length === 0}
                    >
                      Reverse Order
                    </button>
                  </div>

                  {taxiDraftOrder.length > 0 ? (
                    <div className="taxi-draft-order-list">
                      {taxiDraftOrder.map((teamName, index) => (
                        <div key={`${teamName}-${index}`} className="taxi-draft-order-row">
                          <div className="taxi-draft-order-rank">{index + 1}</div>
                          <div className="taxi-draft-order-team">{teamName}</div>
                          <div className="taxi-draft-order-actions">
                            <button
                              type="button"
                              className="taxi-draft-button"
                              onClick={() => handleMoveUp(teamName)}
                              disabled={index === 0}
                            >
                              Move Up
                            </button>
                            <button
                              type="button"
                              className="taxi-draft-button"
                              onClick={() => handleMoveDown(teamName)}
                              disabled={index === taxiDraftOrder.length - 1}
                            >
                              Move Down
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="taxi-draft-order-empty">
                      No teams are available for Taxi Draft order.
                    </div>
                  )}
                </div>
              ) : (
                <div className="taxi-draft-order-empty">
                  Select a league to configure Taxi Draft order.
                </div>
              )}
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
