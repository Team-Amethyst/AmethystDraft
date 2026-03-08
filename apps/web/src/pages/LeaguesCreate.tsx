import { useState, useEffect, Fragment } from "react";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { useLeagueForm } from "../hooks/useLeagueForm";
import { usePageTitle } from "../hooks/usePageTitle";
import {
  hittingStats,
  pitchingStats,
  type Player,
  type TeamKeeper,
} from "../types/league";
import { createLeague } from "../api/leagues";
import { useAuth } from "../contexts/AuthContext";
import { useLeague } from "../contexts/LeagueContext";
import { getPlayers, getPlayersCached } from "../api/players";
import type { Player as ApiPlayer } from "../types/player";
import "../components/AuthNavbar.css";
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
  const { token, user } = useAuth();
  const { refreshLeagues } = useLeague();

  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keeperPlayers, setKeeperPlayers] = useState<Player[]>(() => {
    const cached = getPlayersCached("adp");
    return cached
      ? cached.map((p: ApiPlayer) => ({
          id: Number(p.id),
          name: p.name,
          team: p.team,
          pos: p.positions?.join("/") || p.position,
          adp: p.adp,
          value: p.value,
          headshot: p.headshot,
          positions: p.positions,
        }))
      : [];
  });

  useEffect(() => {
    void getPlayers("adp").then((apiPlayers: ApiPlayer[]) =>
      setKeeperPlayers(
        apiPlayers.map((p) => ({
          id: Number(p.id),
          name: p.name,
          team: p.team,
          pos: p.positions?.join("/") || p.position,
          adp: p.adp,
          value: p.value,
          headshot: p.headshot,
          positions: p.positions,
        })),
      ),
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
    currentKeepers,
    remainingBudget,
    completionPercent,
    filteredPlayers,
    toggleStat,
    updateRosterCount,
    updateTeamName,
    addKeeper,
    removeKeeper,
    getEligibleSlotsForPlayer,
    keeperOwnerMap,
    updateKeeperCost,
  } = useLeagueForm({
    initialName: "Friendly League",
    externalPlayers: keeperPlayers,
  });

  const [pendingPlayer, setPendingPlayer] = useState<Player | null>(null);
  const [pendingCost, setPendingCost] = useState("1");
  const [posFilter, setPosFilter] = useState("ALL");
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

    // Extract abbreviation from labels like "Home Runs (HR)" → "HR"
    const extractAbbr = (label: string) => {
      const m = label.match(/\(([^)]+)\)$/);
      return m ? m[1] : label;
    };

    const playerPoolMap: Record<string, "Mixed" | "AL" | "NL"> = {
      "Mixed MLB": "Mixed",
      "AL-Only": "AL",
      "NL-Only": "NL",
    };

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
              name: extractAbbr(s),
              type: "batting" as const,
            })),
            ...selectedPitching.map((s) => ({
              name: extractAbbr(s),
              type: "pitching" as const,
            })),
          ],
          playerPool: playerPoolMap[playerPool] ?? "Mixed",
          teamNames: teamNames.slice(0, teams),
        },
        token!,
      );
      refreshLeagues();
      navigate(`/leagues/${league.id}/research`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create league");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="league-create-page">
      <header className="league-create-topbar">
        <div className="league-create-brand">
          <span className="league-create-brand-icon">⚡</span>
          <span>DRAFTROOM</span>
        </div>
        <button
          className="user-avatar-btn"
          onClick={() => navigate("/account")}
          title={user?.displayName}
        >
          {user?.displayName?.[0]?.toUpperCase() ?? "?"}
        </button>
      </header>

      <div className="league-create-main">
        <button className="league-create-back" onClick={goBack}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

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
          {step === 1 && (
            <>
              <div className="league-create-card-header">
                <h2>Edit League</h2>
                <p>Set up your MLB auction league structure.</p>
              </div>

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

              <div className="league-create-section">
                <div className="league-create-section-title">
                  ROSTER SLOTS (MLB STANDARD)
                </div>

                <div className="league-create-roster-table">
                  <div className="league-create-roster-header">
                    <span>POSITION</span>
                    <span>COUNT</span>
                  </div>

                  {rosterSlots.map((slot) => (
                    <div
                      key={slot.position}
                      className="league-create-roster-row"
                    >
                      <span>{slot.position}</span>

                      <div className="league-create-roster-controls">
                        <button
                          type="button"
                          onClick={() => updateRosterCount(slot.position, -1)}
                        >
                          −
                        </button>
                        <span>{slot.count}</span>
                        <button
                          type="button"
                          onClick={() => updateRosterCount(slot.position, 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="league-create-total">
                  Total: {totalRosterSpots} roster spots
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="league-create-section-panel">
                <div className="league-create-section-title">Player Pool</div>

                <div className="league-create-pool-grid">
                  {["Mixed MLB", "AL-Only", "NL-Only"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`league-create-pool-card ${
                        playerPool === option ? "selected" : ""
                      }`}
                      onClick={() =>
                        setPlayerPool(
                          option as "Mixed MLB" | "AL-Only" | "NL-Only",
                        )
                      }
                    >
                      <strong>{option}</strong>
                      <span>
                        {option === "Mixed MLB"
                          ? "All players available"
                          : option === "AL-Only"
                            ? "American League only"
                            : "National League only"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

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

              const POS_CATS: Record<string, string[]> = {
                IF: ["1B", "2B", "3B", "SS", "MI", "CI", "IF"],
                P: ["SP", "RP", "P", "TWP"],
              };
              const keeperDisplayPlayers =
                posFilter === "ALL"
                  ? filteredPlayers
                  : filteredPlayers.filter((p) => {
                      const pps = p.pos.split("/").map((x) => x.trim());
                      return pps.some((pp) =>
                        (POS_CATS[posFilter] ?? [posFilter]).includes(pp),
                      );
                    });

              return (
                <>
                  <div className="league-create-keeper-select">
                    <select
                      value={activeKeeperTeam}
                      onChange={(e) => {
                        setActiveKeeperTeam(e.target.value);
                        setPendingPlayer(null);
                      }}
                    >
                      {teamNames.slice(0, teams).map((team, index) => (
                        <option key={index} value={team}>
                          Managing Keepers for: {team}
                        </option>
                      ))}
                    </select>
                  </div>

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

                      <div className="league-create-filter-row">
                        {(["ALL", "C", "IF", "OF", "P"] as const).map((f) => (
                          <button
                            key={f}
                            type="button"
                            className={posFilter === f ? "active" : ""}
                            onClick={() => {
                              setPosFilter(f);
                              setPendingPlayer(null);
                            }}
                          >
                            {f}
                          </button>
                        ))}
                      </div>

                      <div className="league-create-player-list">
                        {keeperDisplayPlayers.map((player) => {
                          const isPending = pendingPlayer?.id === player.id;
                          const eligible = getEligibleSlotsForPlayer(player);
                          const keptByTeam = keeperOwnerMap.get(
                            String(player.id),
                          );
                          return (
                            <Fragment key={player.id}>
                              <div
                                className={
                                  "league-create-player-row" +
                                  (isPending ? " lc-player-pending" : "")
                                }
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

                                <div className="league-create-player-badge">
                                  {player.pos}
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

                                <button
                                  type="button"
                                  className={
                                    "league-create-player-btn" +
                                    (isPending ? " lc-btn-cancel" : "")
                                  }
                                  disabled={!isPending && eligible.length === 0}
                                  onClick={() => {
                                    if (isPending) {
                                      setPendingPlayer(null);
                                      return;
                                    }
                                    setPendingCost(String(player.value ?? 1));
                                    setPendingPlayer(player);
                                  }}
                                >
                                  {isPending ? "×" : "+"}
                                </button>
                              </div>
                              {isPending && (
                                <div className="lc-pos-picker">
                                  <label className="lc-cost-label">
                                    <span>$</span>
                                    <input
                                      type="number"
                                      min={1}
                                      value={pendingCost}
                                      onChange={(e) =>
                                        setPendingCost(e.target.value)
                                      }
                                      className="lc-cost-input"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </label>
                                  <span>Slot:</span>
                                  {eligible.map((slot) => (
                                    <button
                                      key={slot}
                                      type="button"
                                      onClick={() => {
                                        addKeeper(
                                          player,
                                          slot,
                                          parseInt(pendingCost) || 1,
                                        );
                                        setPendingPlayer(null);
                                      }}
                                    >
                                      {slot}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>

                    <div className="league-create-keeper-panel dark">
                      <div className="league-create-keeper-title">
                        2. {activeKeeperTeam.toUpperCase()} KEEPER ROSTER
                      </div>

                      <div className="league-create-progress-copy">
                        <span>
                          {completionPercent}% Completed (
                          {currentKeepers.length}/{keeperRosterRows.length})
                        </span>
                      </div>

                      <div className="league-create-progressbar">
                        <div style={{ width: `${completionPercent}%` }} />
                      </div>

                      <div className="league-create-budget">
                        Remaining Budget: ${remainingBudget}
                      </div>

                      <div className="league-create-roster-list">
                        {keeperRosterRows.map(({ pos, entry }, i) => (
                          <div
                            key={`${pos}-${i}`}
                            className="league-create-roster-keeper-row"
                          >
                            <div className="league-create-roster-slot">
                              {pos}
                            </div>

                            {entry ? (
                              <>
                                {(() => {
                                  const p = keeperPlayers.find(
                                    (kp) =>
                                      String(kp.id) === entry.keeper.playerId,
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
                                <div className="league-create-roster-player">
                                  {entry.keeper.playerName}
                                  <span className="lc-keeper-team">
                                    {entry.keeper.team}
                                  </span>
                                </div>
                                <label className="lc-keeper-cost-wrap">
                                  <span>$</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={entry.keeper.cost}
                                    onChange={(e) =>
                                      updateKeeperCost(
                                        entry.keeperIdx,
                                        parseInt(e.target.value) || 1,
                                      )
                                    }
                                    className="lc-cost-input"
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="league-create-remove"
                                  onClick={() => removeKeeper(entry.keeperIdx)}
                                >
                                  REMOVE
                                </button>
                              </>
                            ) : (
                              <>
                                <div className="league-create-roster-player lc-keeper-empty">
                                  (EMPTY SLOT)
                                </div>
                                <div className="league-create-empty">—</div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}

          <div className="league-create-actions">
            {error && <p className="league-create-error">{error}</p>}
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
