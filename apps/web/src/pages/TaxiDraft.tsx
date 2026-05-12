import { useEffect, useMemo, useState } from "react";
import { useLeague } from "../contexts/LeagueContext";
import { usePageTitle } from "../hooks/usePageTitle";
import {
  initializeTaxiDraftOrder,
  moveTaxiDraftOrderTeamDown,
  moveTaxiDraftOrderTeamUp,
  searchRankedEligibleTaxiPlayers,
  addPlayerToTaxiRoster,
  removePlayerFromTaxiRoster,
} from "../domain/taxiDraft";
import { TaxiDraftPlayerSearch } from "../components/taxi-draft/TaxiDraftPlayerSearch";
import {
  loadTaxiDraftState,
  saveTaxiDraftState,
} from "../utils/taxiDraftPersistence";
import { getPlayers, getPlayersCached } from "../api/players";
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

  const [activeTeamId, setActiveTeamId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [addSearchOpen, setAddSearchOpen] = useState(false);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);

  useEffect(() => {
    if (!league) {
      setTaxiDraftOrder([]);
      setTaxiRosters({});
      return;
    }

    const savedState = loadTaxiDraftState(league.id);
    if (savedState?.taxiDraftOrder?.length) {
      setTaxiDraftOrder(savedState.taxiDraftOrder);
    } else {
      setTaxiDraftOrder(initializeTaxiDraftOrder(leagueTeamNames));
    }

    if (savedState?.taxiRosters) {
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

  // Catalog for search: seed from cache, then always refresh via API (cache may be empty on cold load).
  useEffect(() => {
    if (!league) {
      setAllPlayers([]);
      return;
    }

    const cached = getPlayersCached(
      "catalog_rank",
      league.posEligibilityThreshold,
      league.playerPool,
    );
    if (cached) setAllPlayers(cached);

    let cancelled = false;
    void getPlayers(
      "catalog_rank",
      league.posEligibilityThreshold,
      league.playerPool,
    )
      .then((players) => {
        if (!cancelled) setAllPlayers(players);
      })
      .catch(() => {
        if (!cancelled && !cached) setAllPlayers([]);
      });

    return () => {
      cancelled = true;
    };
  }, [league?.id, league?.posEligibilityThreshold, league?.playerPool]);

  // Load roster entries for drafted player IDs
  useEffect(() => {
    if (!league?.id) {
      setRosterEntries([]);
      return;
    }

    const cached = getRosterCached(league.id);
    if (cached) {
      setRosterEntries(cached);
    } else {
      // Load from API if not cached
      void getRoster(league.id, "").then(setRosterEntries).catch(() => {
        setRosterEntries([]);
      });
    }
  }, [league?.id]);

  useEffect(() => {
    if (!league || leagueTeamNames.length === 0) {
      setActiveTeamId("");
      return;
    }
    setActiveTeamId((prev) => {
      const n = Number.parseInt(prev, 10);
      if (!Number.isNaN(n) && n >= 0 && n < leagueTeamNames.length) return prev;
      return "0";
    });
  }, [league, leagueTeamNames]);

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

  const handleAddPlayer = (playerId: string) => {
    if (!league || !activeTeamId) return;

    const addedAt = new Date().toISOString();
    setTaxiRosters((current) =>
      addPlayerToTaxiRoster(current, activeTeamId, playerId, addedAt)
    );
    setSearchQuery("");
    setAddSearchOpen(false);
  };

  const handleRemovePlayer = (teamId: string, playerId: string) => {
    setTaxiRosters((current) =>
      removePlayerFromTaxiRoster(current, teamId, playerId)
    );
  };

  const draftedIdsList = useMemo(
    () => rosterEntries.map((e) => e.externalPlayerId),
    [rosterEntries],
  );

  const addSearchResults = useMemo(() => {
    if (!league) return [];
    return searchRankedEligibleTaxiPlayers(
      allPlayers,
      searchQuery,
      draftedIdsList,
      taxiRosters,
      { limit: 12 },
    );
  }, [allPlayers, draftedIdsList, league, searchQuery, taxiRosters]);

  // Player lookup helper
  const getPlayerById = useMemo(() => {
    const playerMap = new Map(allPlayers.map(p => [p.id, p]));
    return (playerId: string) => playerMap.get(playerId);
  }, [allPlayers]);

  return (
    <div className="taxi-draft-page">
      <div className="taxi-draft-shell">
        <header className="taxi-draft-header">
          <div>
            <h1 className="taxi-draft-title">Taxi Draft</h1>
            <p className="taxi-draft-subtitle">
              Set taxi draft order, assign eligible players, and manage taxi rosters.
            </p>
          </div>
        </header>

        <div className="taxi-draft-workspace">
          <section className="taxi-draft-order-card cc-surface-inset">
            <div className="taxi-draft-section-label">Taxi draft order</div>
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
                      Reset to league order
                    </button>
                    <button
                      type="button"
                      className="taxi-draft-button taxi-draft-button--secondary"
                      onClick={handleReverseOrder}
                      disabled={taxiDraftOrder.length === 0}
                    >
                      Reverse order
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
                              Up
                            </button>
                            <button
                              type="button"
                              className="taxi-draft-button"
                              onClick={() => handleMoveDown(teamName)}
                              disabled={index === taxiDraftOrder.length - 1}
                            >
                              Down
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="taxi-draft-order-empty">
                      No teams are available for taxi draft order.
                    </div>
                  )}
                </div>
              ) : (
                <div className="taxi-draft-order-empty">
                  Select a league to configure taxi draft order.
                </div>
              )}
            </div>
          </section>

          <section className="taxi-draft-workbench cc-surface-inset">
            <div className="taxi-draft-workbench-head">
              <div className="taxi-draft-section-label">Roster workspace</div>
              <p className="taxi-draft-workbench-lede">
                Pick a team, use the same player search as Command Center, then add. The list
                below shows only that team&apos;s taxi squad.
              </p>
            </div>

            {league ? (
              <>
                <TaxiDraftPlayerSearch
                  searchQuery={searchQuery}
                  onSearchChange={(v) => {
                    setSearchQuery(v);
                    setAddSearchOpen(v.length >= 1);
                  }}
                  onSearchFocus={() => {
                    if (searchQuery.length >= 1) setAddSearchOpen(true);
                  }}
                  showDropdown={addSearchOpen}
                  onDismissDropdown={() => setAddSearchOpen(false)}
                  results={addSearchResults}
                  onPickPlayer={(p) => handleAddPlayer(p.id)}
                  placeholder="Search player to add to taxi roster…"
                  disabled={!activeTeamId}
                />

                <div className="taxi-draft-roster-workspace">
                  <div
                    className="taxi-draft-team-tabs"
                    role="tablist"
                    aria-label="League teams"
                  >
                    {leagueTeamNames.map((teamName, teamIndex) => {
                      const teamId = teamIndex.toString();
                      const count = (taxiRosters[teamId] ?? []).length;
                      const selected = activeTeamId === teamId;
                      return (
                        <button
                          key={teamId}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          className={
                            "taxi-draft-team-tab" + (selected ? " taxi-draft-team-tab--active" : "")
                          }
                          onClick={() => setActiveTeamId(teamId)}
                        >
                          <span className="taxi-draft-team-tab-name">{teamName}</span>
                          <span className="taxi-draft-team-tab-count">{count}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div
                    className="taxi-draft-roster-pane"
                    role="tabpanel"
                    aria-label="Taxi roster for selected team"
                  >
                    {(() => {
                      const teamIndex = Number.parseInt(activeTeamId, 10);
                      const teamId = activeTeamId;
                      const teamName =
                        !Number.isNaN(teamIndex) &&
                        teamIndex >= 0 &&
                        teamIndex < leagueTeamNames.length
                          ? leagueTeamNames[teamIndex] ?? ""
                          : "";
                      const teamRoster = taxiRosters[teamId] ?? [];

                      return (
                        <>
                          <div className="taxi-draft-roster-pane-head">
                            <h2 className="taxi-draft-roster-pane-title">{teamName}</h2>
                            <span className="taxi-draft-roster-pane-meta">
                              {teamRoster.length} taxi player{teamRoster.length !== 1 ? "s" : ""}
                            </span>
                          </div>

                          {teamRoster.length > 0 ? (
                            <div className="taxi-draft-roster-rows">
                              {teamRoster.map((entry) => {
                                const player = getPlayerById(entry.playerId);
                                const headshot = player?.headshot?.trim();

                                return (
                                  <div key={entry.playerId} className="taxi-draft-roster-row">
                                    <div className="taxi-draft-roster-player-info">
                                      {headshot ? (
                                        <img
                                          src={headshot}
                                          alt={player?.name ?? "Player"}
                                          className="taxi-draft-player-headshot"
                                          onError={(e) => {
                                            e.currentTarget.remove();
                                          }}
                                        />
                                      ) : null}
                                      <div className="taxi-draft-roster-player-details">
                                        <div className="taxi-draft-player-name">
                                          {player?.name ?? "Unknown player"}
                                        </div>
                                        <div className="taxi-draft-player-meta">
                                          {player?.team ?? "Unknown"} •{" "}
                                          {player?.position ?? "Unknown"}
                                        </div>
                                        <div className="taxi-draft-roster-meta">
                                          {entry.pickNumber != null && (
                                            <span className="taxi-draft-pick-number">
                                              Pick #{entry.pickNumber}
                                            </span>
                                          )}
                                          <span className="taxi-draft-added-at">
                                            Added {new Date(entry.addedAt).toLocaleDateString()}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="taxi-draft-roster-actions">
                                      <button
                                        type="button"
                                        className="taxi-draft-button taxi-draft-button--remove"
                                        onClick={() => handleRemovePlayer(teamId, entry.playerId)}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="taxi-draft-team-roster-empty">
                              No taxi players for this team yet. Select the tab and search above to
                              add one.
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </>
            ) : (
              <div className="taxi-draft-workbench-empty">
                Select a league to search players and manage taxi rosters.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
