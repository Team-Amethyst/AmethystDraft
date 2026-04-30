import { useState, useEffect } from "react";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
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
import {
  PLAYER_POOL_OPTIONS,
  extractStatAbbreviation,
  keeperDisplayPositions,
  poolFormToApi,
  toLeagueFormPlayer,
} from "../features/leagues/shared";
import "./LeaguesCreate.css";

type Step = 1 | 2 | 3 | 4;

const stepLabels: Record<Step, string> = {
  1: "League Setup",
  2: "Scoring",
  3: "Team Names",
  4: "Keepers",
};

export default function LeagueCreate() {
  usePageTitle("Create League");
  const navigate = useNavigate();
  const { token } = useAuth();
  const { refreshLeagues } = useLeague();

  const [step, setStep] = useState<Step>(1);
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
    remainingBudget,
    filteredPlayers,
    toggleStat,
    setRosterCount,
    resetRosterSlots,
    updateTeamName,
    addKeeper,
    removeKeeper,
    getEligibleSlotsForPlayer,
    keeperOwnerMap,
    updateKeeperCost,
    updateKeeperContract,
    updateKeeperSlot,
    getEligibleSlotsForKeeperAtIndex,
  } = useLeagueForm({
    initialName: "Friendly League",
    externalPlayers: keeperPlayers,
  });

  const [posEligibilityRaw, setPosEligibilityRaw] = useState(
    String(posEligibilityThreshold),
  );

  const goBack = () => {
    if (step === 1) {
      navigate("/leagues");
      return;
    }
    setStep((prev) => (prev - 1) as Step);
  };

  const goNext = async () => {
    if (step < 4) {
      setStep((prev) => (prev + 1) as Step);
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
    <div className="league-create-page theme-page-gradient">
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
          <div className="league-create-step-label">{stepLabels[step]}</div>
        </div>

        <section className="league-create-card">
          <div className="league-create-card-body">
          {step === 1 && (
            <>
              <div className="league-create-card-header">
                <h2>Edit League</h2>
                <p>Set up your MLB auction league structure.</p>
              </div>

              <div className="league-create-setup-layout">
                <div className="league-create-setup-left">
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

                  <div className="league-create-setup-subcard">
                    <div className="league-create-section-title">PLAYER POOL</div>
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
              <div className="league-create-stats-wrap">
                <div className="league-create-section-title">
                  STAT SELECTION
                </div>
                <p className="league-create-mini-copy">
                  Select the individual stats for your Rotisserie league
                  scoring.
                </p>

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
              <div className="league-create-team-panel">
                <div className="league-create-team-header">
                  Name all {teams} teams in your league
                </div>

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

              const keeperDisplayPlayers = filteredPlayers;

              const playersEligibleForSlot = (slotPos: string) =>
                keeperDisplayPlayers.filter((p) => {
                  if (keeperOwnerMap.get(String(p.id))) return false;
                  return getEligibleSlotsForPlayer(p).includes(slotPos);
                });

              return (
                <>
                  <div className="league-create-keepers-layout">
                    <div className="league-create-keeper-panel dark">
                      <div className="league-create-keeper-title">
                        1. AVAILABLE PLAYERS
                      </div>

                      <div className="league-create-searchbar">
                        <Search size={15} />
                        <input
                          placeholder="Search..."
                          value={playerSearch}
                          onChange={(e) => setPlayerSearch(e.target.value)}
                        />
                      </div>

                      <div className="league-create-player-list">
                        {keeperDisplayPlayers.map((player) => {
                          const eligible = getEligibleSlotsForPlayer(player);
                          const keptByTeam = keeperOwnerMap.get(
                            String(player.id),
                          );
                          return (
                            <div
                              key={player.id}
                              className="league-create-player-row"
                            >
                              {player.headshot ? (
                                <img
                                  src={player.headshot}
                                  alt={player.name}
                                  className="lc-keeper-headshot"
                                />
                              ) : (
                                <div className="league-create-avatar">
                                  {player.name
                                    .split(" ")
                                    .map((n) => n[0])
                                    .slice(0, 2)
                                    .join("")}
                                </div>
                              )}

                              <div className="league-create-player-main">
                                <div className="league-create-player-name">
                                  {player.name}
                                </div>
                                <div className="league-create-player-meta">
                                  {player.team}
                                </div>
                              </div>

                              <div className="league-create-player-pos-badges">
                                {keeperDisplayPositions(player)
                                  .slice(0, 4)
                                  .map((pos) => (
                                    <PosBadge key={pos} pos={pos} />
                                  ))}
                              </div>
                              <div className="league-create-player-adp">
                                ADP {player.adp}
                              </div>
                              {keptByTeam && (
                                <div className="league-create-player-kept-badge">
                                  {keptByTeam === activeKeeperTeam
                                    ? "KEPT"
                                    : keptByTeam}
                                </div>
                              )}

                              <select
                                className="lc-available-keeper-add-select"
                                aria-label={`Add ${player.name} at roster slot`}
                                disabled={!!keptByTeam || eligible.length === 0}
                                value=""
                                onChange={(e) => {
                                  const slot = e.target.value;
                                  if (!slot) return;
                                  addKeeper(
                                    player,
                                    slot,
                                    player.value ??
                                      Math.floor(player.adp * 2 + 10),
                                    "",
                                  );
                                  e.target.selectedIndex = 0;
                                }}
                              >
                                <option value="">
                                  {keptByTeam
                                    ? "Already kept"
                                    : eligible.length === 0
                                      ? "No eligible slot"
                                      : "Add keeper…"}
                                </option>
                                {eligible.map((slot) => (
                                  <option key={slot} value={slot}>
                                    {slot}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="league-create-keeper-panel dark">
                      <div className="league-create-keeper-head">
                        <div className="league-create-keeper-title">
                          2. KEEPER ROSTER
                        </div>
                        <select
                          className="league-create-keeper-team-select"
                          value={activeKeeperTeam}
                          onChange={(e) => {
                            setActiveKeeperTeam(e.target.value);
                          }}
                        >
                          {teamNames.slice(0, teams).map((team, index) => (
                            <option key={index} value={team}>
                              {team}
                            </option>
                          ))}
                        </select>
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
                          const slotOptions = entry
                            ? getEligibleSlotsForKeeperAtIndex(entry.keeperIdx)
                            : [];
                          const emptyOptions = playersEligibleForSlot(pos);
                          return (
                            <div
                              key={`${pos}-${i}`}
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
                                  <select
                                    className="lc-keeper-slot-select"
                                    aria-label="Roster slot for this keeper"
                                    value={entry.keeper.slot}
                                    onChange={(e) =>
                                      updateKeeperSlot(
                                        entry.keeperIdx,
                                        e.target.value,
                                      )
                                    }
                                  >
                                    {slotOptions.map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                  <label className="lc-keeper-makeup-paid">
                                    <span className="lc-keeper-makeup-sr">
                                      Paid
                                    </span>
                                    <span>$</span>
                                    <input
                                      type="number"
                                      min={1}
                                      value={entry.keeper.cost}
                                      onChange={(e) =>
                                        updateKeeperCost(
                                          entry.keeperIdx,
                                          parseInt(e.target.value, 10) || 1,
                                        )
                                      }
                                      className="lc-cost-input lc-keeper-makeup-cost-input"
                                    />
                                  </label>
                                  <label className="lc-keeper-makeup-contract">
                                    <span className="lc-keeper-makeup-sr">
                                      Contract
                                    </span>
                                    <input
                                      type="text"
                                      value={entry.keeper.contractType ?? ""}
                                      onChange={(e) =>
                                        updateKeeperContract(
                                          entry.keeperIdx,
                                          e.target.value,
                                        )
                                      }
                                      className="lc-cost-input lc-contract-input lc-keeper-makeup-contract-input"
                                      placeholder="Arb / 3Y"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="lc-keeper-makeup-remove"
                                    onClick={() =>
                                      removeKeeper(entry.keeperIdx)
                                    }
                                  >
                                    Remove
                                  </button>
                                </>
                              ) : (
                                <>
                                  <select
                                    className="lc-keeper-empty-slot-select"
                                    aria-label={`Assign player to ${pos}`}
                                    value=""
                                    onChange={(e) => {
                                      const id = e.target.value;
                                      if (!id) return;
                                      const p = keeperPlayers.find(
                                        (kp) => String(kp.id) === id,
                                      );
                                      if (p) {
                                        addKeeper(
                                          p,
                                          pos,
                                          p.value ??
                                            Math.floor(p.adp * 2 + 10),
                                          "",
                                        );
                                      }
                                      e.target.selectedIndex = 0;
                                    }}
                                  >
                                    <option value="">
                                      {emptyOptions.length === 0
                                        ? "— empty —"
                                        : "Assign player…"}
                                    </option>
                                    {emptyOptions.map((p) => (
                                      <option
                                        key={p.id}
                                        value={String(p.id)}
                                      >
                                        {p.name}
                                      </option>
                                    ))}
                                  </select>
                                  <div
                                    className="team-makeup-slot-money team-makeup-slot-money--paid dim"
                                    aria-hidden
                                  >
                                    —
                                  </div>
                                  <div
                                    className="team-makeup-slot-money team-makeup-slot-money--paid dim"
                                    aria-hidden
                                  >
                                    —
                                  </div>
                                  <span aria-hidden />
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="league-create-budget league-create-budget--subtle">
                        Budget remaining: ${remainingBudget}
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
