import { useState, useEffect, useRef } from "react";
import { ArrowLeft, ChevronDown, Search, Save, X } from "lucide-react";
import { useNavigate } from "react-router";
import PosBadge from "../components/PosBadge";
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
import { LeagueRosterSlotsEditor } from "../components/leagues/LeagueRosterSlotsEditor";
import { KeeperDraftFormPopover } from "../components/leagues/KeeperDraftFormPopover";
import { KeeperSlotSelectWithOverride } from "../components/leagues/KeeperSlotSelectWithOverride";
import {
  PLAYER_POOL_OPTIONS,
  extractStatAbbreviation,
  keeperDisplayPositions,
  poolApiToForm,
  poolFormToApi,
  toLeagueFormPlayer,
} from "../features/leagues/shared";
import "./LeagueSettings.css";

type Section = "setup" | "scoring" | "teams" | "keepers";

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
      contractType: entry.keeperContract,
      playerId: entry.externalPlayerId,
      positions: entry.positions?.length ? entry.positions : undefined,
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
      <div className="ls-page theme-page-gradient">
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
      ? cached.map((p: ApiPlayer) => toLeagueFormPlayer(p))
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
    updateKeeperCost,
    updateKeeperContract,
    updateKeeperSlot,
    getEligibleSlotsForKeeperAtIndex,
    getOpenSlotsForKeeperAtIndex,
  } = useLeagueForm({
    initialName: league.name,
    initialTeams: league.teams,
    initialBudget: league.budget,
    initialPlayerPool: poolApiToForm(league.playerPool),
    initialHitting: hittingStats.filter((s) =>
      league.scoringCategories.some(
        (c) => c.type === "batting" && c.name === extractStatAbbreviation(s),
      ),
    ),
    initialPitching: pitchingStats.filter((s) =>
      league.scoringCategories.some(
        (c) => c.type === "pitching" && c.name === extractStatAbbreviation(s),
      ),
    ),
    initialRosterSlots: league.rosterSlots,
    initialTeamNames: league.teamNames,
    initialPosEligibilityThreshold: league.posEligibilityThreshold ?? 20,
    initialKeepers: {},
    externalPlayers: keeperPlayers,
  });

  const keeperAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [keeperDraftPlayerId, setKeeperDraftPlayerId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (activeSection !== "keepers") setKeeperDraftPlayerId(null);
  }, [activeSection]);

  useEffect(() => {
    setKeeperDraftPlayerId(null);
  }, [activeKeeperTeam]);

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
      setKeeperPlayers(apiPlayers.map((p) => toLeagueFormPlayer(p))),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league.id, token]);

  // Re-fetch keeper player list when the form's playerPool or posEligibilityThreshold changes
  useEffect(() => {
    const apiPool = poolFormToApi(playerPool);
    void getPlayers("adp", posEligibilityThreshold, apiPool).then(
      (apiPlayers: ApiPlayer[]) =>
        setKeeperPlayers(apiPlayers.map((p) => toLeagueFormPlayer(p))),
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
                positions: keeper.positions ?? [keeper.slot],
                price: keeper.cost,
                rosterSlot: keeper.slot,
                isKeeper: true,
                    keeperContract: keeper.contractType,
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
          <nav className="ls-nav theme-surface">
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
          <div className="ls-panel theme-surface">
            {activeSection === "setup" && (
              <div className="ls-section">
                <div className="ls-section-heading">League Setup</div>
                <div className="ls-setup-layout">
                  <div className="ls-form-grid ls-setup-left">
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

                    <div className="ls-setup-subcard">
                      <div className="ls-label">PLAYER POOL</div>
                      <div className="ls-pool-grid ls-pool-grid--setup">
                        {PLAYER_POOL_OPTIONS.map((option) => (
                          <button
                            key={option.formValue}
                            type="button"
                            className={
                              "ls-pool-card" +
                              (playerPool === option.formValue
                                ? " ls-pool-card-selected"
                                : "")
                            }
                            onClick={() => setPlayerPool(option.formValue)}
                          >
                            <strong>{option.formValue}</strong>
                            <span>{option.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="ls-subsection ls-setup-slots ls-setup-right">
                    <div className="ls-label">ROSTER SLOTS</div>
                    <LeagueRosterSlotsEditor
                      className="league-roster-editor--static"
                      rosterSlots={rosterSlots}
                      totalRosterSpots={totalRosterSpots}
                      onSetRosterCount={setRosterCount}
                      onResetRosterSlots={resetRosterSlots}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeSection === "scoring" && (
              <div className="ls-section">
                <div className="ls-section-heading">Scoring</div>

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

                const keeperAvailablePlayers = filteredPlayers.filter(
                  (p) => !keeperOwnerMap.get(String(p.id)),
                );

                return (
                  <div className="ls-section">
                    <div className="ls-section-heading">Keepers</div>

                    <div className="ls-keepers-layout">
                      <div className="ls-keeper-panel ls-keeper-panel--available">
                        <div className="ls-keeper-title">AVAILABLE PLAYERS</div>
                        <div className="ls-searchbar ls-searchbar--keepers">
                          <Search size={14} />
                          <input
                            placeholder="Search..."
                            value={playerSearch}
                            onChange={(e) => setPlayerSearch(e.target.value)}
                          />
                        </div>
                        <div className="ls-player-list ls-player-list--keepers">
                          <div
                            className="ls-available-table-head ls-player-row ls-player-row--keepers"
                            role="row"
                            aria-hidden
                          >
                            <span className="ls-available-th ls-available-th--avatar" />
                            <div className="ls-available-th">Player</div>
                            <div className="ls-available-th">Team</div>
                            <div className="ls-available-th ls-available-th--pos">
                              Pos
                            </div>
                            <div className="ls-available-th ls-available-th--adp">
                              ADP
                            </div>
                            <span
                              className="ls-available-th ls-available-th--action ls-available-th--action-spacer"
                              aria-hidden
                            />
                          </div>
                          {keeperAvailablePlayers.map((player) => {
                            const eligible = getEligibleSlotsForPlayer(player);
                            const openSlots = getOpenSlotsForPlayer(player);
                            const draftOpen =
                              keeperDraftPlayerId === String(player.id);
                            return (
                              <div key={player.id} className="ls-keeper-player-stack">
                                <div className="ls-player-row ls-player-row--keepers">
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
                                <div className="ls-player-main ls-player-main--name-only">
                                  <div className="ls-player-name">
                                    {player.name}
                                  </div>
                                </div>
                                <div className="ls-player-team-col">
                                  {player.team || "—"}
                                </div>
                                <div className="ls-pos-badges">
                                  {keeperDisplayPositions(player)
                                    .slice(0, 3)
                                    .map((pos) => (
                                      <PosBadge key={pos} pos={pos} />
                                    ))}
                                </div>
                                <div className="ls-player-adp">
                                  {player.adp ?? "—"}
                                </div>
                                <div className="keeper-draft-popover-anchor ls-keeper-draft-trigger-cell">
                                  {openSlots.length === 0 ? (
                                    <span
                                      className="ls-keeper-row-status ls-keeper-row-status--muted"
                                      title="No open roster slots"
                                    >
                                      —
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      className="ls-keeper-draft-icon-btn"
                                      aria-label={`Draft ${player.name} as keeper`}
                                      aria-expanded={draftOpen}
                                      aria-haspopup="dialog"
                                      ref={(el) => {
                                        if (draftOpen) {
                                          keeperAnchorRef.current = el;
                                        }
                                      }}
                                      onClick={() => {
                                        const id = String(player.id);
                                        setKeeperDraftPlayerId((prev) =>
                                          prev === id ? null : id,
                                        );
                                      }}
                                    >
                                      <ChevronDown
                                        className="ls-keeper-draft-icon-btn-chevron"
                                        aria-hidden
                                        size={18}
                                        strokeWidth={2.25}
                                      />
                                    </button>
                                  )}
                                  {keeperDraftPlayerId === String(player.id) && (
                                    <KeeperDraftFormPopover
                                      key={player.id}
                                      anchorRef={keeperAnchorRef}
                                      player={player}
                                      eligibleSlots={eligible}
                                      assignableSlots={openSlots}
                                      defaultCost={
                                        player.value ??
                                        Math.floor(player.adp * 2 + 10)
                                      }
                                      onClose={() =>
                                        setKeeperDraftPlayerId(null)
                                      }
                                      onDraft={(slot, cost, contract) => {
                                        addKeeper(
                                          player,
                                          slot,
                                          cost,
                                          contract,
                                        );
                                      }}
                                    />
                                  )}
                                </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="ls-keeper-panel ls-keeper-panel--roster">
                        <div className="ls-keeper-cc-head">
                          <span className="ls-keeper-cc-label">Keeper roster</span>
                          <select
                            className="ls-keeper-team-select ls-keeper-team-select--cc"
                            aria-label="Team to edit keepers for"
                            value={activeKeeperTeam}
                            onChange={(e) => {
                              setActiveKeeperTeam(e.target.value);
                            }}
                          >
                            {teamNames.slice(0, teams).map((name, i) => (
                              <option key={i} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="team-makeup-slots ls-keeper-makeup">
                          <div
                            className="team-makeup-head-row ls-keeper-makeup-head"
                            aria-hidden
                          >
                            <span className="team-makeup-head-badge-spacer" />
                            <div className="team-makeup-head-player">Player</div>
                            <div className="ls-keeper-makeup-head-cell">Slot</div>
                            <div className="team-makeup-head-money">Paid</div>
                            <div className="ls-keeper-makeup-head-cell ls-keeper-makeup-head-contract">
                              Contract
                            </div>
                            <span className="ls-keeper-makeup-head-actions" />
                          </div>
                          {keeperRosterRows.map(({ pos, entry }, i) => {
                            const rowKey = `${pos}-${i}`;
                            const eligibleSlots = entry
                              ? getEligibleSlotsForKeeperAtIndex(entry.keeperIdx)
                              : [];
                            const assignableSlots = entry
                              ? getOpenSlotsForKeeperAtIndex(entry.keeperIdx)
                              : [];
                            return (
                              <div
                                key={rowKey}
                                className={
                                  "team-makeup-slot-row ls-keeper-makeup-row" +
                                  (entry
                                    ? " team-makeup-slot-row--filled"
                                    : " team-makeup-slot-row--empty")
                                }
                              >
                                <PosBadge pos={pos} />
                                {entry ? (
                                  <>
                                    <div
                                      className="team-makeup-slot-player ls-keeper-makeup-player"
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
                                      <span className="ls-keeper-makeup-name">
                                        {entry.keeper.playerName}
                                        <span className="ls-keeper-team">
                                          {entry.keeper.team}
                                        </span>
                                      </span>
                                    </div>
                                    <KeeperSlotSelectWithOverride
                                      eligibleSlots={eligibleSlots}
                                      assignableSlots={assignableSlots}
                                      value={entry.keeper.slot}
                                      onChange={(slot) =>
                                        updateKeeperSlot(
                                          entry.keeperIdx,
                                          slot,
                                        )
                                      }
                                      selectClassName="ls-keeper-slot-select"
                                      hideLabel
                                      compact
                                      showIneligibleHint={false}
                                      rootClassName="ls-keeper-slot-select-wrap"
                                    />
                                    <label className="ls-keeper-makeup-paid">
                                      <span className="ls-keeper-makeup-sr">
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
                                        className="ls-cost-input ls-keeper-makeup-cost-input"
                                      />
                                    </label>
                                    <label className="ls-keeper-makeup-contract">
                                      <span className="ls-keeper-makeup-sr">
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
                                        className="ls-cost-input ls-contract-input ls-keeper-makeup-contract-input"
                                        placeholder="Arb / 3Y"
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      className="ls-keeper-makeup-remove"
                                      aria-label={`Remove ${entry.keeper.playerName} from keepers`}
                                      onClick={() =>
                                        removeKeeper(entry.keeperIdx)
                                      }
                                    >
                                      <X size={15} strokeWidth={2.25} aria-hidden />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <div
                                      className="team-makeup-slot-player ls-keeper-empty-player"
                                      title="Empty roster slot"
                                    >
                                      — empty —
                                    </div>
                                    <div
                                      className="ls-keeper-roster-cell ls-keeper-roster-cell--slot ls-keeper-roster-cell--empty"
                                      aria-hidden
                                    >
                                      —
                                    </div>
                                    <div
                                      className="ls-keeper-roster-cell ls-keeper-roster-cell--paid ls-keeper-roster-cell--empty"
                                      aria-hidden
                                    >
                                      —
                                    </div>
                                    <div
                                      className="ls-keeper-roster-cell ls-keeper-roster-cell--contract ls-keeper-roster-cell--empty"
                                      aria-hidden
                                    >
                                      —
                                    </div>
                                    <span
                                      className="ls-keeper-roster-actions-spacer"
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
                );
              })()}

            <div className="ls-save-row">
              {saveError && (
                <p className="ls-save-error">{saveError}</p>
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
