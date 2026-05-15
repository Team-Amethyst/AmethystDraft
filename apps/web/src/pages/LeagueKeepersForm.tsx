import { useState, useEffect, useRef, useMemo } from "react";
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
import { getRoster, addRosterEntry, removeRosterEntry } from "../api/roster";
import type { RosterEntry } from "../api/roster";
import { getPlayers, getPlayersCached } from "../api/players";
import type { Player as ApiPlayer } from "../types/player";
import { KeeperDraftFormPopover } from "../components/leagues/KeeperDraftFormPopover";
import { KeeperSlotSelectWithOverride } from "../components/leagues/KeeperSlotSelectWithOverride";
import {
  extractStatAbbreviation,
  keeperDisplayPositions,
  poolApiToForm,
  poolFormToApi,
  toLeagueFormPlayer,
} from "../features/leagues/shared";
import { rosterEntriesToTeamKeepersMap } from "../features/leagues/rosterEntriesToTeamKeepersMap";
import "./LeagueSettings.css";
import { MODEL_RANK_TOOLTIP } from "../domain/rankTierLabels";

export function LeagueKeepersForm({
  league,
  embedded = false,
}: {
  league: League;
  embedded?: boolean;
}) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { refreshLeagues } = useLeague();

  usePageTitle(embedded ? `${league.name} Settings` : `${league.name} — Keepers`);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedKeeperEntries, setSavedKeeperEntries] = useState<RosterEntry[]>(
    [],
  );
  const [keeperPlayers, setKeeperPlayers] = useState<Player[]>(() => {
    const cached = getPlayersCached(
      "catalog_rank",
      league.posEligibilityThreshold,
      league.playerPool,
    );
    return cached
      ? cached.map((p: ApiPlayer) => toLeagueFormPlayer(p))
      : [];
  });

  const {
    teams,
    posEligibilityThreshold,
    rosterSlots,
    playerPool,
    teamNames,
    activeKeeperTeam,
    setActiveKeeperTeam,
    playerSearch,
    setPlayerSearch,
    teamKeepers,
    setTeamKeepers,
    currentKeepers,
    filteredPlayers,
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
    setKeeperDraftPlayerId(null);
  }, [activeKeeperTeam]);

  useEffect(() => {
    if (!token) return;
    getRoster(league.id, token)
      .then((entries) => {
        const keeperEntries = entries.filter((e) => e.isKeeper);
        setSavedKeeperEntries(keeperEntries);
        setTeamKeepers(
          rosterEntriesToTeamKeepersMap(keeperEntries, league.teamNames),
        );
      })
      .catch(() => {
        /* non-fatal */
      });
    void getPlayers(
      "catalog_rank",
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
    void getPlayers("catalog_rank", posEligibilityThreshold, apiPool).then(
      (apiPlayers: ApiPlayer[]) =>
        setKeeperPlayers(apiPlayers.map((p) => toLeagueFormPlayer(p))),
    );
  }, [playerPool, posEligibilityThreshold]);

  const backPath = `/leagues/${league.id}/research`;

  const keepersBySlot = useMemo(() => {
    const m: Record<string, { keeper: TeamKeeper; keeperIdx: number }[]> = {};
    currentKeepers.forEach((k, i) => {
      if (!m[k.slot]) m[k.slot] = [];
      m[k.slot].push({ keeper: k, keeperIdx: i });
    });
    return m;
  }, [currentKeepers]);

  const keeperRosterRows = useMemo(
    () =>
      rosterSlots.flatMap((s) =>
        Array.from({ length: s.count }, (_, i) => ({
          pos: s.position,
          entry: keepersBySlot[s.position]?.[i] ?? null,
        })),
      ),
    [rosterSlots, keepersBySlot],
  );

  const keeperAvailablePlayers = useMemo(
    () => filteredPlayers.filter((p) => !keeperOwnerMap.get(String(p.id))),
    [filteredPlayers, keeperOwnerMap],
  );

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setSaveError(null);
    try {
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
      if (embedded) {
        const entries = await getRoster(league.id, token);
        const keeperEntries = entries.filter((e) => e.isKeeper);
        setSavedKeeperEntries(keeperEntries);
      } else {
        navigate(backPath);
      }
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save keepers",
      );
    } finally {
      setSaving(false);
    }
  };

  const keepersEditor = (
    <>
      <div className="ls-section">
        <div className="ls-section-heading">
          {embedded ? "Keepers" : "Keeper rosters"}
        </div>

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
                            <div
                              className="ls-available-th ls-available-th--adp"
                              title={MODEL_RANK_TOOLTIP}
                            >
                              Model rank
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
                                  {player.catalog_rank ?? "—"}
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
                                        Math.floor(player.catalog_rank * 2 + 10)
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
                            className="app-select app-select--compact ls-keeper-team-select ls-keeper-team-select--cc"
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
          <span>{saving ? "Saving…" : "Save keepers"}</span>
        </button>
      </div>
    </>
  );

  if (embedded) return keepersEditor;

  return (
    <div className="ls-page">
      <div className="ls-container">
        <button className="ls-back" onClick={() => navigate(backPath)}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <div className="ls-header">
          <h1>{league.name} — Keepers</h1>
          <p>
            Assign keeper costs and slots per team. Changes apply when you save.
          </p>
        </div>

        <div className="ls-panel theme-surface">{keepersEditor}</div>
      </div>
    </div>
  );
}
