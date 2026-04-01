import { useState, useEffect, Fragment } from "react";
import { ArrowLeft, Search, Save } from "lucide-react";
import { useNavigate } from "react-router";
import { useLeague } from "../contexts/LeagueContext";
import type { League } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { useLeagueForm } from "../hooks/useLeagueForm";
import { usePageTitle } from "../hooks/usePageTitle";
import {
  hittingStats,
  pitchingStats,
  type Player,
  type TeamKeeper,
} from "../types/league";
import { updateLeague } from "../api/leagues";
import { getRoster, addRosterEntry, removeRosterEntry } from "../api/roster";
import type { RosterEntry } from "../api/roster";
import { getPlayers, getPlayersCached } from "../api/players";
import type { Player as ApiPlayer } from "../types/player";
import "./LeagueSettings.css";

type Section = "setup" | "scoring" | "teams" | "keepers";

const abbr = (label: string) => label.match(/\(([^)]+)\)$/)?.[1] ?? label;

const poolToForm: Record<string, "Mixed MLB" | "AL-Only" | "NL-Only"> = {
  Mixed: "Mixed MLB",
  AL: "AL-Only",
  NL: "NL-Only",
};
const poolToApi: Record<string, "Mixed" | "AL" | "NL"> = {
  "Mixed MLB": "Mixed",
  "AL-Only": "AL",
  "NL-Only": "NL",
};

function keepersToMap(
  entries: RosterEntry[],
  teamNames: string[],
): Record<string, TeamKeeper[]> {
  const result: Record<string, TeamKeeper[]> = {};
  for (const entry of entries) {
    if (!entry.isKeeper) continue;
    // teamId is "team_N" where N is 1-based index
    const idx = entry.teamId
      ? parseInt(entry.teamId.replace("team_", ""), 10) - 1
      : -1;
    const teamName = teamNames[idx] ?? `Team ${idx + 1}`;
    if (!result[teamName]) result[teamName] = [];
    result[teamName].push({
      slot: entry.rosterSlot,
      playerName: entry.playerName,
      team: entry.playerTeam,
      cost: entry.price,
      playerId: entry.externalPlayerId,
      entryId: entry._id,
    });
  }
  return result;
}

const navItems: { id: Section; label: string; desc: string }[] = [
  { id: "setup", label: "League Setup", desc: "Name, teams, budget, roster" },
  { id: "scoring", label: "Scoring", desc: "Player pool & stat categories" },
  { id: "teams", label: "Team Names", desc: "Customize each team's name" },
  { id: "keepers", label: "Keepers", desc: "Manage keeper rosters per team" },
];

export default function LeagueSettings() {
  const { league, loading } = useLeague();
  if (loading && !league)
    return (
      <div className="ls-page">
        <div
          className="ls-container"
          style={{ padding: "40px 0", color: "var(--text-muted)" }}
        >
          Loading…
        </div>
      </div>
    );
  if (!league) return null;
  return <LeagueSettingsForm league={league} />;
}

function LeagueSettingsForm({ league }: { league: League }) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { refreshLeagues } = useLeague();

  usePageTitle(`${league.name} Settings`);
  const [activeSection, setActiveSection] = useState<Section>("setup");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedKeeperEntries, setSavedKeeperEntries] = useState<RosterEntry[]>(
    [],
  );
  const [pendingPlayer, setPendingPlayer] = useState<Player | null>(null);
  const [pendingCost, setPendingCost] = useState("1");
  const [posFilter, setPosFilter] = useState("ALL");
  const [posEligibilityRaw, setPosEligibilityRaw] = useState(
    String(league.posEligibilityThreshold ?? 20),
  );
  const [keeperPlayers, setKeeperPlayers] = useState<Player[]>(() => {
    const cached = getPlayersCached(
      "adp",
      league.posEligibilityThreshold,
      league.playerPool,
    );
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
    setTeamKeepers,
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
    initialName: league.name,
    initialTeams: league.teams,
    initialBudget: league.budget,
    initialPlayerPool: poolToForm[league.playerPool] ?? "Mixed MLB",
    initialHitting: hittingStats.filter((s) =>
      league.scoringCategories.some(
        (c) => c.type === "batting" && c.name === abbr(s),
      ),
    ),
    initialPitching: pitchingStats.filter((s) =>
      league.scoringCategories.some(
        (c) => c.type === "pitching" && c.name === abbr(s),
      ),
    ),
    initialRosterSlots: league.rosterSlots,
    initialTeamNames: league.teamNames,
    initialPosEligibilityThreshold: league.posEligibilityThreshold ?? 20,
    initialKeepers: {},
    externalPlayers: keeperPlayers,
  });

  useEffect(() => {
    if (!token) return;
    getRoster(league.id, token)
      .then((entries) => {
        const keeperEntries = entries.filter((e) => e.isKeeper);
        setSavedKeeperEntries(keeperEntries);
        setTeamKeepers(keepersToMap(keeperEntries, league.teamNames));
      })
      .catch(() => {
        /* non-fatal */
      });
    void getPlayers(
      "adp",
      league.posEligibilityThreshold,
      league.playerPool,
    ).then((apiPlayers: ApiPlayer[]) =>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league.id, token]);

  // Re-fetch keeper player list when the form's playerPool or posEligibilityThreshold changes
  useEffect(() => {
    const apiPool = poolToApi[playerPool] ?? "Mixed";
    void getPlayers("adp", posEligibilityThreshold, apiPool).then(
      (apiPlayers: ApiPlayer[]) =>
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
  }, [playerPool, posEligibilityThreshold]);

  const backPath = `/leagues/${league.id}/research`;

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setSaveError(null);
    const rosterSlotsMap = Object.fromEntries(
      rosterSlots.map((s) => [s.position, s.count]),
    );
    try {
      await updateLeague(
        league.id,
        {
          name: leagueName,
          teams,
          budget,
          posEligibilityThreshold: Math.max(1, posEligibilityThreshold || 1),
          rosterSlots: rosterSlotsMap,
          scoringCategories: [
            ...selectedHitting.map((s) => ({
              name: abbr(s),
              type: "batting" as const,
            })),
            ...selectedPitching.map((s) => ({
              name: abbr(s),
              type: "pitching" as const,
            })),
          ],
          playerPool: poolToApi[playerPool] ?? "Mixed",
          teamNames: teamNames.slice(0, teams),
        },
        token,
      );

      // Save keepers: delete all existing, then re-add current local state
      await Promise.all(
        savedKeeperEntries.map((e) =>
          removeRosterEntry(league.id, e._id, token),
        ),
      );
      const currentTeamNames = teamNames.slice(0, teams);
      const keeperAdds: Promise<unknown>[] = [];
      for (let i = 0; i < currentTeamNames.length; i++) {
        const teamName = currentTeamNames[i];
        const keepers = teamKeepers[teamName] ?? [];
        const teamUserId = league.memberIds[i];
        for (const keeper of keepers) {
          keeperAdds.push(
            addRosterEntry(
              league.id,
              {
                externalPlayerId: keeper.playerId,
                playerName: keeper.playerName,
                playerTeam: keeper.team,
                positions: [keeper.slot],
                price: keeper.cost,
                rosterSlot: keeper.slot,
                isKeeper: true,
                teamId: `team_${i + 1}`,
                userId: teamUserId,
              },
              token,
            ),
          );
        }
      }
      await Promise.all(keeperAdds);

      refreshLeagues();
      navigate(backPath);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save settings",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ls-page">
      <div className="ls-container">
        <button className="ls-back" onClick={() => navigate(backPath)}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <div className="ls-header">
          <h1>{league.name} Settings</h1>
          <p>
            Edit any section independently — changes won't be saved until you
            click Save.
          </p>
        </div>

        <div className="ls-layout">
          {/* Sidebar nav */}
          <nav className="ls-nav">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={
                  "ls-nav-item" +
                  (activeSection === item.id ? " ls-nav-item-active" : "")
                }
                onClick={() => setActiveSection(item.id)}
              >
                <span className="ls-nav-label">{item.label}</span>
                <span className="ls-nav-desc">{item.desc}</span>
              </button>
            ))}
          </nav>

          {/* Content panel */}
          <div className="ls-panel">
            {activeSection === "setup" && (
              <div className="ls-section">
                <div className="ls-section-heading">League Setup</div>

                <div className="ls-form-grid">
                  <div className="ls-field">
                    <label>LEAGUE NAME</label>
                    <input
                      value={leagueName}
                      onChange={(e) => setLeagueName(e.target.value)}
                    />
                  </div>
                  <div className="ls-field">
                    <label>TEAMS</label>
                    <input
                      type="number"
                      value={teams}
                      onChange={(e) => setTeams(Number(e.target.value))}
                    />
                  </div>
                  <div className="ls-field">
                    <label>BUDGET ($)</label>
                    <input
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(Number(e.target.value))}
                    />
                  </div>
                  <div className="ls-field">
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

                <div className="ls-subsection">
                  <div className="ls-label">ROSTER SLOTS</div>
                  <div className="ls-roster-table">
                    <div className="ls-roster-header">
                      <span>POSITION</span>
                      <span>COUNT</span>
                    </div>
                    {rosterSlots.map((slot) => (
                      <div key={slot.position} className="ls-roster-row">
                        <span>{slot.position}</span>
                        <div className="ls-roster-controls">
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
                  <div className="ls-total">
                    Total: {totalRosterSpots} roster spots
                  </div>
                </div>
              </div>
            )}

            {activeSection === "scoring" && (
              <div className="ls-section">
                <div className="ls-section-heading">Scoring</div>

                <div className="ls-label" style={{ marginBottom: "10px" }}>
                  PLAYER POOL
                </div>
                <div className="ls-pool-grid">
                  {(["Mixed MLB", "AL-Only", "NL-Only"] as const).map(
                    (option) => (
                      <button
                        key={option}
                        type="button"
                        className={
                          "ls-pool-card" +
                          (playerPool === option
                            ? " ls-pool-card-selected"
                            : "")
                        }
                        onClick={() => setPlayerPool(option)}
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
                    ),
                  )}
                </div>

                <div className="ls-subsection">
                  <div className="ls-label">STAT CATEGORIES</div>
                  <div className="ls-stats-grid">
                    <div className="ls-stats-col">
                      <div className="ls-sublabel">HITTING</div>
                      <div className="ls-check-grid">
                        {hittingStats.map((stat) => (
                          <label key={stat} className="ls-check-card">
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
                    <div className="ls-stats-col">
                      <div className="ls-sublabel">PITCHING</div>
                      <div className="ls-check-grid">
                        {pitchingStats.map((stat) => (
                          <label key={stat} className="ls-check-card">
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
              </div>
            )}

            {activeSection === "teams" && (
              <div className="ls-section">
                <div className="ls-section-heading">Team Names</div>
                <p className="ls-copy">
                  Name all {teams} teams in your league.
                </p>
                <div className="ls-team-grid">
                  {teamNames.slice(0, teams).map((name, i) => (
                    <div key={i} className="ls-field">
                      <label>Team {i + 1}</label>
                      <input
                        value={name}
                        onChange={(e) => updateTeamName(i, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSection === "keepers" &&
              (() => {
                // Group current keepers by slot for the right panel
                const keepersBySlot: Record<
                  string,
                  { keeper: TeamKeeper; keeperIdx: number }[]
                > = {};
                currentKeepers.forEach((k, i) => {
                  if (!keepersBySlot[k.slot]) keepersBySlot[k.slot] = [];
                  keepersBySlot[k.slot].push({ keeper: k, keeperIdx: i });
                });

                // All roster slot rows for the right panel
                const keeperRosterRows = rosterSlots.flatMap((s) =>
                  Array.from({ length: s.count }, (_, i) => ({
                    pos: s.position,
                    entry: keepersBySlot[s.position]?.[i] ?? null,
                  })),
                );

                // Player list filtered by position category
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
                  <div className="ls-section">
                    <div className="ls-section-heading">Keepers</div>

                    <select
                      className="ls-keeper-select"
                      value={activeKeeperTeam}
                      onChange={(e) => {
                        setActiveKeeperTeam(e.target.value);
                        setPendingPlayer(null);
                      }}
                    >
                      {teamNames.slice(0, teams).map((name, i) => (
                        <option key={i} value={name}>
                          Managing keepers for: {name}
                        </option>
                      ))}
                    </select>

                    <div className="ls-keepers-layout">
                      <div className="ls-keeper-panel">
                        <div className="ls-keeper-title">AVAILABLE PLAYERS</div>
                        <div className="ls-searchbar">
                          <Search size={14} />
                          <input
                            placeholder="Search..."
                            value={playerSearch}
                            onChange={(e) => setPlayerSearch(e.target.value)}
                          />
                        </div>
                        <div className="ls-filter-row">
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
                        <div className="ls-player-list">
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
                                    "ls-player-row" +
                                    (isPending ? " ls-player-pending" : "")
                                  }
                                >
                                  {player.headshot ? (
                                    <img
                                      src={player.headshot}
                                      alt={player.name}
                                      className="ls-keeper-headshot"
                                    />
                                  ) : (
                                    <div className="ls-avatar">
                                      {player.name
                                        .split(" ")
                                        .map((n) => n[0])
                                        .slice(0, 2)
                                        .join("")}
                                    </div>
                                  )}
                                  <div className="ls-player-main">
                                    <div className="ls-player-name">
                                      {player.name}
                                    </div>
                                    <div className="ls-player-meta">
                                      {player.team}
                                    </div>
                                  </div>
                                  <div className="ls-badge">{player.pos}</div>
                                  <div className="ls-adp">ADP {player.adp}</div>
                                  {keptByTeam && (
                                    <div className="ls-kept-badge">
                                      {keptByTeam === activeKeeperTeam
                                        ? "KEPT"
                                        : keptByTeam}
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    className={
                                      "ls-add-btn" +
                                      (isPending ? " ls-add-btn-cancel" : "")
                                    }
                                    disabled={
                                      !isPending && eligible.length === 0
                                    }
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
                                  <div className="ls-pos-picker">
                                    <label className="ls-cost-label">
                                      <span>$</span>
                                      <input
                                        type="number"
                                        min={1}
                                        value={pendingCost}
                                        onChange={(e) =>
                                          setPendingCost(e.target.value)
                                        }
                                        className="ls-cost-input"
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

                      <div className="ls-keeper-panel">
                        <div className="ls-keeper-title">
                          {activeKeeperTeam.toUpperCase()} — KEEPER ROSTER
                        </div>
                        <div className="ls-progress-copy">
                          {completionPercent}% filled ({currentKeepers.length}/
                          {keeperRosterRows.length})
                        </div>
                        <div className="ls-progressbar">
                          <div style={{ width: `${completionPercent}%` }} />
                        </div>
                        <div className="ls-budget">
                          Remaining Budget: ${remainingBudget}
                        </div>
                        <div className="ls-player-list">
                          {keeperRosterRows.map(({ pos, entry }, i) => (
                            <div key={`${pos}-${i}`} className="ls-keeper-row">
                              <div className="ls-keeper-slot">{pos}</div>
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
                                        className="ls-keeper-headshot-sm"
                                      />
                                    ) : (
                                      <div className="ls-keeper-init">
                                        {entry.keeper.playerName
                                          .split(" ")
                                          .map((n) => n[0])
                                          .slice(0, 2)
                                          .join("")}
                                      </div>
                                    );
                                  })()}
                                  <div className="ls-keeper-player">
                                    {entry.keeper.playerName}
                                    <span className="ls-keeper-team">
                                      {entry.keeper.team}
                                    </span>
                                  </div>
                                  <label className="ls-keeper-cost-wrap">
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
                                      className="ls-cost-input"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="ls-remove-btn"
                                    onClick={() =>
                                      removeKeeper(entry.keeperIdx)
                                    }
                                  >
                                    Remove
                                  </button>
                                </>
                              ) : (
                                <>
                                  <div className="ls-keeper-player ls-keeper-empty">
                                    (empty)
                                  </div>
                                  <div className="ls-empty-slot">—</div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

            <div className="ls-save-row">
              {saveError && (
                <p
                  style={{
                    color: "var(--error, #f87171)",
                    margin: "0 0 8px",
                    fontSize: "13px",
                  }}
                >
                  {saveError}
                </p>
              )}
              <button
                className="ls-save-btn"
                onClick={handleSave}
                disabled={saving}
              >
                <Save size={15} />
                <span>{saving ? "Saving…" : "Save Settings"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
