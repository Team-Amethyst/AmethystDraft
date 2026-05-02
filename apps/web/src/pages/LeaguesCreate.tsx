import { useState, useEffect, type KeyboardEvent } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { useNavigate } from "react-router";
import PosBadge from "../components/PosBadge";
import { useLeagueForm } from "../hooks/useLeagueForm";
import { usePageTitle } from "../hooks/usePageTitle";
import {
  hittingStats,
  pitchingStats,
  type Player,
  type TeamKeeper,
} from "../types/league";
import { createLeague } from "../api/leagues";
import { addRosterEntry } from "../api/roster";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { getPlayers, getPlayersCached } from "../api/players";
import type { Player as ApiPlayer } from "../types/player";
import AuthNavbar from "../components/AuthNavbar";
import { LeagueRosterSlotsEditor } from "../components/leagues/LeagueRosterSlotsEditor";
import { KeeperDraftInlineExpand } from "../components/leagues/KeeperDraftInlineExpand";
import { LeagueCreateStepHeader } from "../components/leagues/LeagueCreateStepHeader";
import {
  PLAYER_POOL_OPTIONS,
  extractStatAbbreviation,
  keeperDisplayPositions,
  poolFormToApi,
  toLeagueFormPlayer,
} from "../features/leagues/shared";
import {
  LEAGUE_CREATE_STEP_LABELS,
  type LeagueCreateStep,
} from "../features/leagues/createFlow";
import "./LeaguesCreate.css";

export default function LeagueCreate() {
  usePageTitle("Create League");
  const navigate = useNavigate();
  const { token } = useAuth();
  const { refreshLeagues } = useLeague();

  const [step, setStep] = useState<LeagueCreateStep>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keeperPlayers, setKeeperPlayers] = useState<Player[]>(() => {
    const cached = getPlayersCached("adp");
    return cached
      ? cached.map((p: ApiPlayer) => toLeagueFormPlayer(p))
      : [];
  });

  useEffect(() => {
    void getPlayers("adp").then((apiPlayers: ApiPlayer[]) =>
      setKeeperPlayers(apiPlayers.map((p) => toLeagueFormPlayer(p))),
    );
  }, []);

  const {
    leagueName,
    setLeagueName,
    teams,
    setTeams,
    budget,
    setBudget,
    posEligibilityThreshold,
    setPosEligibilityThreshold,
    rosterSlots,
    totalRosterSpots,
    playerPool,
    setPlayerPool,
    selectedHitting,
    setSelectedHitting,
    selectedPitching,
    setSelectedPitching,
    teamNames,
    activeKeeperTeam,
    setActiveKeeperTeam,
    playerSearch,
    setPlayerSearch,
    teamKeepers,
    currentKeepers,
    filteredPlayers,
    toggleStat,
    setRosterCount,
    resetRosterSlots,
    updateTeamName,
    addKeeper,
    removeKeeper,
    getEligibleSlotsForPlayer,
    getOpenSlotsForPlayer,
    keeperOwnerMap,
  } = useLeagueForm({
    initialName: "Friendly League",
    externalPlayers: keeperPlayers,
  });

  const [posEligibilityRaw, setPosEligibilityRaw] = useState(
    String(posEligibilityThreshold),
  );

  const [keeperDraftPlayerId, setKeeperDraftPlayerId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (step !== 4) {
      setKeeperDraftPlayerId(null);
    }
  }, [step]);

  useEffect(() => {
    setKeeperDraftPlayerId(null);
  }, [activeKeeperTeam]);

  const goBack = () => {
    if (step === 1) {
      navigate("/leagues");
      return;
    }
    setStep((prev) => (prev - 1) as LeagueCreateStep);
  };

  const goNext = async () => {
    if (step < 4) {
      setStep((prev) => (prev + 1) as LeagueCreateStep);
      return;
    }

    const rosterSlotsMap = Object.fromEntries(
      rosterSlots.map((s) => [s.position, s.count]),
    );

    setSubmitting(true);
    setError(null);
    try {
      const league = await createLeague(
        {
          name: leagueName,
          teams,
          budget,
          posEligibilityThreshold: Math.max(1, posEligibilityThreshold || 1),
          rosterSlots: rosterSlotsMap,
          scoringCategories: [
            ...selectedHitting.map((s) => ({
              name: extractStatAbbreviation(s),
              type: "batting" as const,
            })),
            ...selectedPitching.map((s) => ({
              name: extractStatAbbreviation(s),
              type: "pitching" as const,
            })),
          ],
          playerPool: poolFormToApi(playerPool),
          teamNames: teamNames.slice(0, teams),
        },
        token!,
      );

      // Save keepers for each team using explicit teamId so they land on the correct team
      const currentTeamNames = teamNames.slice(0, teams);
      const keeperAdds: Promise<unknown>[] = [];
      for (let i = 0; i < currentTeamNames.length; i++) {
        const teamName = currentTeamNames[i];
        const keepers = teamKeepers[teamName] ?? [];
        for (const keeper of keepers) {
          keeperAdds.push(
            addRosterEntry(
              league.id,
              {
                externalPlayerId: keeper.playerId,
                playerName: keeper.playerName,
                playerTeam: keeper.team,
                positions: keeper.positions ?? [keeper.slot],
                price: keeper.cost,
                rosterSlot: keeper.slot,
                isKeeper: true,
                keeperContract: keeper.contractType,
                teamId: `team_${i + 1}`,
              },
              token!,
            ),
          );
        }
      }
      if (keeperAdds.length > 0) {
        await Promise.all(keeperAdds);
      }

      refreshLeagues();
      navigate(`/leagues/${league.id}/research`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create league");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={
        "league-create-page theme-page-gradient" +
        (step === 4 ? " league-create-page--keepers-step" : "")
      }
    >
      <AuthNavbar />

      <div className="league-create-main">
        <div className="league-create-step-row">
          <div className="league-create-steps">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="league-create-step-item">
                <div
                  className={`league-create-step-circle ${step >= n ? "active" : ""}`}
                >
                  {n}
                </div>
                {n < 4 && (
                  <div
                    className={`league-create-step-line ${step > n ? "active" : ""}`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="league-create-step-label">{LEAGUE_CREATE_STEP_LABELS[step]}</div>
        </div>

        <section className="league-create-card">
          <div
            className={
              "league-create-card-body" +
              (step === 4 ? " league-create-card-body--keepers-step" : "")
            }
          >
          {step === 1 && (
            <>
              <LeagueCreateStepHeader
                title={LEAGUE_CREATE_STEP_LABELS[1]}
                lead="Configure league structure, player pool, and roster slots for your new league."
              />

              <div className="league-create-setup-layout">
                <div className="league-create-setup-left-stack">
                  <div className="league-create-setup-panel">
                    <div className="league-create-form-grid">
                      <div className="league-create-field">
                        <label>LEAGUE NAME</label>
                        <input
                          value={leagueName}
                          onChange={(e) => setLeagueName(e.target.value)}
                        />
                      </div>

                      <div className="league-create-field">
                        <label>TEAMS</label>
                        <input
                          type="number"
                          value={teams}
                          onChange={(e) => setTeams(Number(e.target.value))}
                        />
                      </div>

                      <div className="league-create-field">
                        <label>BUDGET ($)</label>
                        <input
                          type="number"
                          value={budget}
                          onChange={(e) => setBudget(Number(e.target.value))}
                        />
                      </div>

                      <div className="league-create-field">
                        <label>POSITION ELIGIBILITY (MIN. GAMES)</label>
                        <input
                          type="number"
                          value={posEligibilityRaw}
                          min={1}
                          onChange={(e) => setPosEligibilityRaw(e.target.value)}
                          onBlur={() => {
                            const clamped = Math.max(
                              1,
                              Number(posEligibilityRaw) || 1,
                            );
                            setPosEligibilityThreshold(clamped);
                            setPosEligibilityRaw(String(clamped));
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="league-create-setup-panel">
                    <div className="league-create-section-title">
                      PLAYER POOL
                    </div>
                    <div className="league-create-pool-grid league-create-pool-grid--setup">
                      {PLAYER_POOL_OPTIONS.map((option) => (
                        <button
                          key={option.formValue}
                          type="button"
                          className={`league-create-pool-card ${
                            playerPool === option.formValue ? "selected" : ""
                          }`}
                          onClick={() =>
                            setPlayerPool(
                              option.formValue as
                                | "Mixed MLB"
                                | "AL-Only"
                                | "NL-Only",
                            )
                          }
                        >
                          <strong>{option.formValue}</strong>
                          <span>{option.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="league-create-section league-create-setup-right">
                  <div className="league-create-section-title">
                    ROSTER SLOTS (MLB STANDARD)
                  </div>
                  <LeagueRosterSlotsEditor
                    className="league-roster-editor--static"
                    rosterSlots={rosterSlots}
                    totalRosterSpots={totalRosterSpots}
                    onSetRosterCount={setRosterCount}
                    onResetRosterSlots={resetRosterSlots}
                  />
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <LeagueCreateStepHeader
                title={LEAGUE_CREATE_STEP_LABELS[2]}
                lead="Select the individual stats for your Rotisserie league scoring."
              />

              <div className="league-create-stats-wrap lc-flow-surface lc-flow-stack">
                <div className="league-create-stats-grid">
                  <div className="league-create-stats-column">
                    <div className="league-create-subtitle">HITTING STATS</div>
                    <div className="league-create-check-grid">
                      {hittingStats.map((stat) => (
                        <label key={stat} className="league-create-check-card">
                          <input
                            type="checkbox"
                            checked={selectedHitting.includes(stat)}
                            onChange={() =>
                              toggleStat(
                                stat,
                                selectedHitting,
                                setSelectedHitting,
                              )
                            }
                          />
                          <span>{stat}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="league-create-stats-column">
                    <div className="league-create-subtitle">PITCHING STATS</div>
                    <div className="league-create-check-grid">
                      {pitchingStats.map((stat) => (
                        <label key={stat} className="league-create-check-card">
                          <input
                            type="checkbox"
                            checked={selectedPitching.includes(stat)}
                            onChange={() =>
                              toggleStat(
                                stat,
                                selectedPitching,
                                setSelectedPitching,
                              )
                            }
                          />
                          <span>{stat}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <LeagueCreateStepHeader
                title={LEAGUE_CREATE_STEP_LABELS[3]}
                lead={`Name all ${teams} teams in your league.`}
              />

              <div className="league-create-team-panel lc-flow-surface">
                <div className="league-create-team-grid">
                  {teamNames.slice(0, teams).map((team, index) => (
                    <div key={index} className="league-create-field">
                      <label>Team {index + 1}</label>
                      <input
                        value={team}
                        onChange={(e) => updateTeamName(index, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 4 &&
            (() => {
              const keepersBySlot: Record<
                string,
                { keeper: TeamKeeper; keeperIdx: number }[]
              > = {};
              currentKeepers.forEach((k, i) => {
                if (!keepersBySlot[k.slot]) keepersBySlot[k.slot] = [];
                keepersBySlot[k.slot].push({ keeper: k, keeperIdx: i });
              });

              const keeperRosterRows = rosterSlots.flatMap((s) =>
                Array.from({ length: s.count }, (_, i) => ({
                  pos: s.position,
                  entry: keepersBySlot[s.position]?.[i] ?? null,
                })),
              );

              const keeperAvailablePlayers = filteredPlayers.filter(
                (p) => !keeperOwnerMap.get(String(p.id)),
              );

              const keeperTeamTabs = teamNames.slice(0, teams);

              const onKeeperTabsKeyDown = (
                e: KeyboardEvent<HTMLDivElement>,
              ) => {
                if (
                  e.key !== "ArrowRight" &&
                  e.key !== "ArrowLeft" &&
                  e.key !== "Home" &&
                  e.key !== "End"
                ) {
                  return;
                }
                e.preventDefault();
                const list = keeperTeamTabs;
                if (list.length === 0) return;
                const i = Math.max(0, list.indexOf(activeKeeperTeam));
                let ni = i;
                if (e.key === "ArrowRight") {
                  ni = Math.min(list.length - 1, i + 1);
                } else if (e.key === "ArrowLeft") {
                  ni = Math.max(0, i - 1);
                } else if (e.key === "Home") {
                  ni = 0;
                } else if (e.key === "End") {
                  ni = list.length - 1;
                }
                const next = list[ni];
                if (!next) return;
                setActiveKeeperTeam(next);
                queueMicrotask(() => {
                  document.getElementById(`lc-keeper-tab-${ni}`)?.focus();
                });
              };

              return (
                <>
                  <LeagueCreateStepHeader
                    variant="keepers"
                    title={LEAGUE_CREATE_STEP_LABELS[4]}
                    lead="Pick a team tab, then add keepers from the list and edit the roster on the right."
                  />

                  <div className="league-create-keepers-shell">
                    <div
                      className="lc-keeper-team-tabs"
                      role="tablist"
                      aria-label="Team to edit keepers for"
                      onKeyDown={onKeeperTabsKeyDown}
                    >
                      {keeperTeamTabs.map((name, index) => {
                        const selected = activeKeeperTeam === name;
                        return (
                          <button
                            key={`${name}-${index}`}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            id={`lc-keeper-tab-${index}`}
                            tabIndex={selected ? 0 : -1}
                            aria-controls="lc-keeper-tabpanel"
                            className={
                              "lc-keeper-team-tab" +
                              (selected ? " lc-keeper-team-tab--active" : "")
                            }
                            onClick={() => setActiveKeeperTeam(name)}
                          >
                            <span className="lc-keeper-team-tab-label">
                              {name}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div
                      className="league-create-keepers-layout"
                      id="lc-keeper-tabpanel"
                      role="tabpanel"
                      aria-label={`Keepers for ${activeKeeperTeam}`}
                    >
                    <div className="league-create-keeper-panel dark league-create-keeper-panel--available">
                      <div className="league-create-keeper-title">
                        1. AVAILABLE PLAYERS
                      </div>

                      <div className="league-create-searchbar league-create-searchbar--keepers">
                        <Search size={15} />
                        <input
                          placeholder="Search..."
                          value={playerSearch}
                          onChange={(e) => setPlayerSearch(e.target.value)}
                        />
                      </div>

                      <div className="lc-available-scroll">
                        <div
                          className="lc-available-table-head league-create-player-row league-create-player-row--keepers"
                          role="row"
                          aria-hidden
                        >
                          <span className="lc-available-th lc-available-th--avatar" />
                          <div className="lc-available-th">Player</div>
                          <div className="lc-available-th">Team</div>
                          <div className="lc-available-th lc-available-th--pos">
                            Pos
                          </div>
                          <div className="lc-available-th lc-available-th--adp">
                            ADP
                          </div>
                          <span
                            className="lc-available-th lc-available-th--action lc-available-th--action-spacer"
                            aria-hidden
                          />
                        </div>

                        <div className="league-create-player-list league-create-player-list--keepers">
                        {keeperAvailablePlayers.map((player) => {
                          const eligible = getEligibleSlotsForPlayer(player);
                          const openSlots = getOpenSlotsForPlayer(player);
                          const draftOpen =
                            keeperDraftPlayerId === String(player.id);
                          return (
                            <div
                              key={player.id}
                              className="lc-keeper-player-stack"
                            >
                            <div
                              className={
                                "league-create-player-row league-create-player-row--keepers" +
                                (draftOpen
                                  ? " league-create-player-row--keepers-expanded"
                                  : "")
                              }
                            >
                              {player.headshot ? (
                                <img
                                  src={player.headshot}
                                  alt={player.name}
                                  className="lc-keeper-headshot"
                                />
                              ) : (
                                <div className="league-create-avatar" aria-hidden>
                                  {player.name
                                    .split(" ")
                                    .map((n) => n[0])
                                    .slice(0, 2)
                                    .join("")}
                                </div>
                              )}

                              <div className="league-create-player-main league-create-player-main--name-only">
                                <div className="league-create-player-name">
                                  {player.name}
                                </div>
                              </div>

                              <div className="league-create-player-team-col">
                                {player.team || "—"}
                              </div>

                              <div className="league-create-player-pos-badges">
                                {keeperDisplayPositions(player)
                                  .slice(0, 3)
                                  .map((pos) => (
                                    <PosBadge key={pos} pos={pos} />
                                  ))}
                              </div>
                              <div className="league-create-player-adp">
                                {player.adp ?? "—"}
                              </div>

                              <div className="lc-keeper-draft-trigger-cell">
                                {openSlots.length === 0 ? (
                                  <span
                                    className="lc-keeper-row-status lc-keeper-row-status--muted"
                                    title="No open roster slots"
                                  >
                                    —
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="lc-keeper-draft-icon-btn"
                                    aria-label={`Draft ${player.name} as keeper`}
                                    aria-expanded={draftOpen}
                                    onClick={() => {
                                      const id = String(player.id);
                                      setKeeperDraftPlayerId((prev) =>
                                        prev === id ? null : id,
                                      );
                                    }}
                                  >
                                    <ChevronDown
                                      className="lc-keeper-draft-icon-btn-chevron"
                                      aria-hidden
                                      size={18}
                                      strokeWidth={2.25}
                                    />
                                  </button>
                                )}
                              </div>
                            </div>
                            {draftOpen && (
                              <KeeperDraftInlineExpand
                                player={player}
                                eligibleSlots={eligible}
                                assignableSlots={openSlots}
                                defaultCost={
                                  player.value ??
                                  Math.floor(player.adp * 2 + 10)
                                }
                                onCancel={() => setKeeperDraftPlayerId(null)}
                                onDraft={(slot, cost, contract) => {
                                  addKeeper(player, slot, cost, contract);
                                  setKeeperDraftPlayerId(null);
                                }}
                              />
                            )}
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    </div>

                    <div className="league-create-keeper-panel dark league-create-keeper-panel--roster">
                      <div className="league-create-keeper-cc-head league-create-keeper-cc-head--tabs-only">
                        <span className="league-create-keeper-cc-label">
                          2. Keeper roster
                        </span>
                      </div>

                      <div className="team-makeup-slots league-create-keeper-makeup">
                        <div
                          className="team-makeup-head-row lc-keeper-makeup-head"
                          aria-hidden
                        >
                          <span className="team-makeup-head-badge-spacer" />
                          <div className="team-makeup-head-player">Player</div>
                          <div className="lc-keeper-makeup-head-cell">Slot</div>
                          <div className="team-makeup-head-money">Paid</div>
                          <div className="lc-keeper-makeup-head-cell lc-keeper-makeup-head-contract">
                            Contract
                          </div>
                          <span className="lc-keeper-makeup-head-actions" />
                        </div>
                        {keeperRosterRows.map(({ pos, entry }, i) => {
                          const rowKey = `${pos}-${i}`;
                          return (
                            <div
                              key={rowKey}
                              className={
                                "team-makeup-slot-row lc-keeper-makeup-row" +
                                (entry
                                  ? " team-makeup-slot-row--filled"
                                  : " team-makeup-slot-row--empty")
                              }
                            >
                              <PosBadge pos={pos} />
                              {entry ? (
                                <>
                                  <div
                                    className="team-makeup-slot-player lc-keeper-makeup-player"
                                    title={entry.keeper.playerName}
                                  >
                                    {(() => {
                                      const p = keeperPlayers.find(
                                        (kp) =>
                                          String(kp.id) ===
                                          entry.keeper.playerId,
                                      );
                                      return p?.headshot ? (
                                        <img
                                          src={p.headshot}
                                          alt={entry.keeper.playerName}
                                          className="lc-keeper-headshot-sm"
                                        />
                                      ) : (
                                        <div className="lc-keeper-init">
                                          {entry.keeper.playerName
                                            .split(" ")
                                            .map((n) => n[0])
                                            .slice(0, 2)
                                            .join("")}
                                        </div>
                                      );
                                    })()}
                                    <span className="lc-keeper-makeup-name">
                                      {entry.keeper.playerName}
                                      <span className="lc-keeper-team">
                                        {entry.keeper.team}
                                      </span>
                                    </span>
                                  </div>
                                  <div
                                    className="lc-keeper-roster-cell lc-keeper-roster-cell--slot"
                                    title={entry.keeper.slot}
                                  >
                                    {entry.keeper.slot}
                                  </div>
                                  <div
                                    className="lc-keeper-roster-cell lc-keeper-roster-cell--paid"
                                    title={`$${entry.keeper.cost}`}
                                  >
                                    ${entry.keeper.cost}
                                  </div>
                                  <div
                                    className="lc-keeper-roster-cell lc-keeper-roster-cell--contract"
                                    title={
                                      entry.keeper.contractType?.trim() || ""
                                    }
                                  >
                                    {entry.keeper.contractType?.trim() || "—"}
                                  </div>
                                  <div className="lc-keeper-roster-actions">
                                    <button
                                      type="button"
                                      className="lc-keeper-roster-remove-btn"
                                      aria-label={`Remove ${entry.keeper.playerName} from keepers`}
                                      onClick={() =>
                                        removeKeeper(entry.keeperIdx)
                                      }
                                    >
                                      <X
                                        size={15}
                                        strokeWidth={2.25}
                                        aria-hidden
                                      />
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div
                                    className="team-makeup-slot-player lc-keeper-empty-player"
                                    title="Empty roster slot"
                                  >
                                    — empty —
                                  </div>
                                  <div
                                    className="lc-keeper-roster-cell lc-keeper-roster-cell--slot lc-keeper-roster-cell--empty"
                                    aria-hidden
                                  >
                                    —
                                  </div>
                                  <div
                                    className="lc-keeper-roster-cell lc-keeper-roster-cell--paid lc-keeper-roster-cell--empty"
                                    aria-hidden
                                  >
                                    —
                                  </div>
                                  <div
                                    className="lc-keeper-roster-cell lc-keeper-roster-cell--contract lc-keeper-roster-cell--empty"
                                    aria-hidden
                                  >
                                    —
                                  </div>
                                  <span
                                    className="lc-keeper-roster-actions lc-keeper-roster-actions--spacer"
                                    aria-hidden
                                  />
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>

                    </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="league-create-actions">
            {error && <p className="league-create-error">{error}</p>}
            <button
              type="button"
              className="league-create-secondary"
              onClick={goBack}
              disabled={submitting}
            >
              <ArrowLeft size={15} />
              <span>Back</span>
            </button>
            <button
              type="button"
              className="league-create-primary"
              onClick={goNext}
              disabled={submitting}
            >
              <span>
                {step === 4
                  ? submitting
                    ? "Creating…"
                    : "Create League"
                  : "Continue"}
              </span>
              {step !== 4 && <ChevronRight size={16} />}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
