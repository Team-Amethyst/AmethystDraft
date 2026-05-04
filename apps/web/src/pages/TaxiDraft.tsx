import { useEffect, useMemo, useState } from "react";
import { useLeague } from "../contexts/LeagueContext";
import { usePageTitle } from "../hooks/usePageTitle";
import {
  initializeTaxiDraftOrder,
  moveTaxiDraftOrderTeamDown,
  moveTaxiDraftOrderTeamUp,
  searchEligibleTaxiPlayers,
  addPlayerToTaxiRoster,
} from "../domain/taxiDraft";
import {
  loadTaxiDraftState,
  saveTaxiDraftState,
} from "../utils/taxiDraftPersistence";
import { getPlayersCached } from "../api/players";
import { getRoster, getRosterCached, type RosterEntry } from "../api/roster";
import type { Player } from "../types/player";
import type { TaxiRosters } from "../types/taxiDraft";
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
  const [taxiRosters, setTaxiRosters] = useState<TaxiRosters>({});

  // Add player section state
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);

  useEffect(() => {
    if (!league) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTaxiDraftOrder([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTaxiRosters({});
      return;
    }

    const savedState = loadTaxiDraftState(league.id);
    if (savedState?.taxiDraftOrder?.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTaxiDraftOrder(savedState.taxiDraftOrder);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTaxiDraftOrder(initializeTaxiDraftOrder(leagueTeamNames));
    }

    if (savedState?.taxiRosters) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTaxiRosters(savedState.taxiRosters);
    }
  }, [league, leagueTeamNames]);

  useEffect(() => {
    if (!league) return;
    saveTaxiDraftState(league.id, {
      taxiDraftOrder,
      taxiRosters,
    });
  }, [league, taxiDraftOrder, taxiRosters]);

  // Load players for search
  useEffect(() => {
    const cached = getPlayersCached("adp", league?.posEligibilityThreshold, league?.playerPool);
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAllPlayers(cached);
    }
  }, [league?.posEligibilityThreshold, league?.playerPool]);

  // Load roster entries for drafted player IDs
  useEffect(() => {
    if (!league?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRosterEntries([]);
      return;
    }

    const cached = getRosterCached(league.id);
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRosterEntries(cached);
    } else {
      // Load from API if not cached
      void getRoster(league.id, "").then(setRosterEntries).catch(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRosterEntries([]);
      });
    }
  }, [league?.id]);

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

  // Add player handlers
  const handleAddPlayer = (playerId: string) => {
    if (!selectedTeamId) return;

    const addedAt = new Date().toISOString();
    setTaxiRosters((current) =>
      addPlayerToTaxiRoster(current, selectedTeamId, playerId, addedAt)
    );
  };

  // Search results
  const searchResults = useMemo(() => {
    if (!league) return [];
    const draftedIds = rosterEntries.map(e => e.externalPlayerId);
    return searchEligibleTaxiPlayers(
      allPlayers,
      searchQuery,
      draftedIds,
      taxiRosters
    );
  }, [allPlayers, searchQuery, rosterEntries, taxiRosters, league]);

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
            <div className="taxi-draft-card-body taxi-draft-add-player-body">
              {league ? (
                <div className="taxi-draft-add-player-wrapper">
                  <div className="taxi-draft-add-player-controls">
                    <select
                      className="taxi-draft-select"
                      value={selectedTeamId}
                      onChange={(e) => setSelectedTeamId(e.target.value)}
                    >
                      <option value="">Select a team...</option>
                      {leagueTeamNames.map((teamName, index) => (
                        <option key={index} value={index.toString()}>
                          {teamName}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      className="taxi-draft-search-input"
                      placeholder="Search players by name, team, or position..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  {searchQuery.length > 0 && (
                    <div className="taxi-draft-search-results">
                      {searchResults.length > 0 ? (
                        searchResults.slice(0, 10).map((player) => (
                          <div key={player.id} className="taxi-draft-player-row">
                            <div className="taxi-draft-player-info">
                              <img
                                src={player.headshot}
                                alt={player.name}
                                className="taxi-draft-player-headshot"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextElementSibling!.textContent = player.name
                                    .split(' ')
                                    .map(w => w[0])
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase();
                                }}
                              />
                              <div className="taxi-draft-player-headshot-fallback">
                                {player.name
                                  .split(' ')
                                  .map(w => w[0])
                                  .join('')
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </div>
                              <div className="taxi-draft-player-details">
                                <div className="taxi-draft-player-name">{player.name}</div>
                                <div className="taxi-draft-player-meta">
                                  {player.team} • {player.position}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="taxi-draft-button taxi-draft-button--add"
                              onClick={() => handleAddPlayer(player.id)}
                              disabled={!selectedTeamId}
                            >
                              Add
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="taxi-draft-no-results">
                          No eligible players found matching "{searchQuery}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="taxi-draft-add-player-empty">
                  Select a league to add players to taxi rosters.
                </div>
              )}
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
