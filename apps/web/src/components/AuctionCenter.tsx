import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router";
import PosBadge from "./PosBadge";
import { useLeague } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import type { Player } from "../types/player";
import { addRosterEntry, removeRosterEntry } from "../api/roster";
import type { RosterEntry } from "../api/roster";
import { getStatByCategory } from "../pages/commandCenterUtils";
import {
  getValuation,
  getValuationPlayer,
  type ValuationResult,
} from "../api/engine";
import { resolveUserTeamId } from "../utils/team";
import { resolveValuationNumber } from "../utils/valuation";

import {
  getEligibleSlotsForPositions,
  hasPitcherEligibility,
} from "../utils/eligibility";
import { UserPlus } from "lucide-react";

interface AuctionCenterProps {
  rosterEntries: RosterEntry[];
  refreshRoster: () => void;
  allPlayers: Player[];
  selectedPlayer: Player | null;
  setSelectedPlayer: (p: Player | null) => void;
  draftedIds: Set<string>;
  myTeamEntries: RosterEntry[];
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  onAddMissingPlayer?: () => void;
}

export function AuctionCenter({
  rosterEntries,
  refreshRoster,
  allPlayers,
  selectedPlayer,
  setSelectedPlayer,
  draftedIds,
  myTeamEntries,
  showToast,
  onAddMissingPlayer,
}: AuctionCenterProps) {
  const { id: leagueId } = useParams<{ id: string }>();
  const { league } = useLeague();
  const { token, user } = useAuth();
  const { isInWatchlist } = useWatchlist();
  const { getNote, setNote } = usePlayerNotes();

  const [valuationMap, setValuationMap] = useState<
    Map<string, ValuationResult>
  >(new Map());

  // Fetch (and re-fetch after each pick) engine valuations — best-effort, never blocks the UI
  useEffect(() => {
    if (!leagueId || !token) return;
    let cancelled = false;
    const userTeamId = resolveUserTeamId(league, user?.id);
    getValuation(leagueId, token, userTeamId)
      .then((res) => {
        if (cancelled) return;
        setValuationMap(new Map(res.valuations.map((v) => [v.player_id, v])));
      })
      .catch(() => {
        if (cancelled) return;
        setValuationMap(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, token, rosterEntries.length, league, user?.id]);

  // Lighter per-player refresh when the card changes (merges into map; full board still on roster change).
  useEffect(() => {
    if (!leagueId || !token || !selectedPlayer) return;
    let cancelled = false;
    const playerId = selectedPlayer.id;
    const userTeamId = resolveUserTeamId(league, user?.id);
    void getValuationPlayer(leagueId, token, playerId, userTeamId)
      .then((res) => {
        if (cancelled) return;
        const row = res.player;
        if (row && row.player_id !== playerId) return;
        if (row) {
          setValuationMap((prev) => {
            const next = new Map(prev);
            next.set(playerId, row);
            return next;
          });
        }
      })
      .catch(() => {
        /* keep last full-board map; player-only is best-effort */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch when selected id changes
  }, [leagueId, token, selectedPlayer?.id, league, user?.id]);

  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const [wonBy, setWonBy] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  /** True after user edits bid $; avoids overwriting with late Engine payload. */
  const bidPriceTouchedRef = useRef(false);
  const [draftedToSlot, setDraftedToSlot] = useState("");
  const [statView, setStatView] = useState<"hitting" | "pitching">("pitching");
  const [submitting, setSubmitting] = useState(false);
  const [redoStack, setRedoStack] = useState<RosterEntry[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  // Seed "Won By" default when league loads
  useEffect(() => {
    if (league && !wonBy) setWonBy(league.teamNames[0] ?? "");
  }, [league, wonBy]);

  // Seed slot default when league loads
  useEffect(() => {
    if (league && !draftedToSlot)
      setDraftedToSlot(Object.keys(league.rosterSlots)[0] ?? "SP");
  }, [league, draftedToSlot]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // When a new player is selected, initialise stat view + bid default (Engine row when present).
  // valuationMap is read intentionally only on player change; a separate effect syncs late Engine payloads.
  useEffect(() => {
    if (!selectedPlayer) return;
    bidPriceTouchedRef.current = false;
    const isPitcher = hasPitcherEligibility(
      selectedPlayer.positions,
      selectedPlayer.position,
    );
    setStatView(isPitcher ? "pitching" : "hitting");
    const v = valuationMap.get(selectedPlayer.id);
    const seed = v
      ? resolveValuationNumber(
          {
            value: selectedPlayer.value,
            baseline_value: v.baseline_value,
            adjusted_value: v.adjusted_value,
            recommended_bid: v.recommended_bid,
            team_adjusted_value: v.team_adjusted_value,
          },
          "team_adjusted_value",
        )
      : selectedPlayer.value;
    setFinalPrice(String(seed));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset bid when the selected player changes
  }, [selectedPlayer]);

  // When valuations refresh, update bid default from Engine if user has not edited the field
  useEffect(() => {
    if (!selectedPlayer || bidPriceTouchedRef.current) return;
    const v = valuationMap.get(selectedPlayer.id);
    if (v === undefined) return;
    setFinalPrice(
      String(
        resolveValuationNumber(
          {
            value: selectedPlayer.value,
            baseline_value: v.baseline_value,
            adjusted_value: v.adjusted_value,
            recommended_bid: v.recommended_bid,
            team_adjusted_value: v.team_adjusted_value,
          },
          "team_adjusted_value",
        ),
      ),
    );
  }, [valuationMap, selectedPlayer]);

  const onFinalPriceChange = useCallback((value: string) => {
    bidPriceTouchedRef.current = true;
    setFinalPrice(value);
  }, []);

  const getEngineDisplayValues = useCallback(
    (valuationRow: ValuationResult | undefined, fallbackValue: number) => {
      const baseline = valuationRow?.baseline_value;
      const market = valuationRow?.adjusted_value;
      const likely =
        valuationRow?.recommended_bid ?? market ?? baseline ?? fallbackValue;
      const your =
        valuationRow?.team_adjusted_value ??
        valuationRow?.recommended_bid ??
        market ??
        baseline ??
        fallbackValue;
      return {
        your,
        likely,
        market: market ?? likely,
        strength: baseline ?? market ?? likely,
      };
    },
    [],
  );

  const dropdownResults = (() => {
    if (searchQuery.length < 1) return [];
    const q = searchQuery.toLowerCase().trim();
    const available = allPlayers.filter((p) => !draftedIds.has(p.id));
    const scored = available.flatMap((p) => {
      const full = p.name.toLowerCase();
      const parts = full.split(/\s+/);
      if (full.startsWith(q)) return [{ p, score: 0 }];
      if (parts.some((part) => part.startsWith(q))) return [{ p, score: 1 }];
      if (parts.some((part) => part.includes(q))) return [{ p, score: 2 }];
      if (full.includes(q)) return [{ p, score: 3 }];
      return [];
    });
    return scored
      .sort((a, b) => a.score - b.score || (a.p.adp ?? 999) - (b.p.adp ?? 999))
      .map((x) => x.p)
      .slice(0, 8);
  })();

  const handleSelectPlayer = (player: Player) => {
    setSelectedPlayer(player);
    setSearchQuery("");
    setShowDropdown(false);
  };

  const handleLogResult = async () => {
    if (!selectedPlayer || !leagueId || !token || !league) return;
    const teamIdx = league.teamNames.indexOf(wonBy);
    if (teamIdx === -1) {
      showToast("Team not found in league", "error");
      return;
    }
    const userId = league.memberIds[teamIdx]; // undefined for unjoined teams
    const teamId = `team_${teamIdx + 1}`;
    const price = parseInt(finalPrice, 10) || 1;
    const totalSlots = Object.values(league.rosterSlots).reduce(
      (a, b) => a + b,
      0,
    );
    const teamEntries = rosterEntries.filter((e) => e.teamId === teamId);
    const spent = teamEntries.reduce((s, e) => s + e.price, 0);
    const open = Math.max(0, totalSlots - teamEntries.length);
    const remaining = Math.max(0, league.budget - spent);
    const maxBid = open > 0 ? Math.max(1, remaining - (open - 1)) : 0;
    if (price > maxBid) {
      showToast(`$${price} exceeds ${wonBy}'s max bid of $${maxBid}`, "error");
      return;
    }
    const playerName = selectedPlayer.name;
    setSubmitting(true);
    setSelectedPlayer(null);
    setFinalPrice("");
    try {
      await addRosterEntry(
        leagueId,
        {
          externalPlayerId: selectedPlayer.id,
          playerName: selectedPlayer.name,
          playerTeam: selectedPlayer.team,
          positions: selectedPlayer.positions?.length
            ? selectedPlayer.positions
            : [selectedPlayer.position],
          price,
          rosterSlot: draftedToSlot,
          isKeeper: false,
          userId,
          teamId,
        },
        token,
      );
      setRedoStack([]);
      refreshRoster();
      showToast(
        `✓ ${playerName} drafted to ${draftedToSlot} for $${price}`,
        "success",
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to log result",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndo = async () => {
    if (!leagueId || !token || rosterEntries.length === 0) return;
    const sorted = [...rosterEntries].sort(
      (a, b) =>
        new Date(a.acquiredAt ?? a.createdAt ?? 0).getTime() -
        new Date(b.acquiredAt ?? b.createdAt ?? 0).getTime(),
    );
    const entry = sorted[sorted.length - 1];
    try {
      await removeRosterEntry(leagueId, entry._id, token);
      setRedoStack((prev) => [...prev, entry]);
      refreshRoster();
      showToast(`↩ Undid ${entry.playerName}`, "info");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Undo failed", "error");
    }
  };

  const handleRedo = async () => {
    if (!leagueId || !token || redoStack.length === 0 || !league) return;
    const entry = redoStack[redoStack.length - 1];
    try {
      await addRosterEntry(
        leagueId,
        {
          externalPlayerId: entry.externalPlayerId,
          playerName: entry.playerName,
          playerTeam: entry.playerTeam,
          positions: entry.positions,
          price: entry.price,
          rosterSlot: entry.rosterSlot,
          isKeeper: entry.isKeeper,
          userId: entry.userId,
          teamId: entry.teamId,
        },
        token,
      );
      setRedoStack((prev) => prev.slice(0, -1));
      refreshRoster();
      showToast(`↪ Redid ${entry.playerName}`, "info");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Redo failed", "error");
    }
  };

  // Derived pitching / batting stat refs
  const sp = selectedPlayer?.stats?.pitching;
  const sb = selectedPlayer?.stats?.batting;
  const k9 = sp
    ? (() => {
        const ip = parseFloat(sp.innings);
        return ip > 0 ? ((sp.strikeouts / ip) * 9).toFixed(1) : "--";
      })()
    : "--";

  // Category impact rows
  const catImpactRows = (() => {
    if (!selectedPlayer || !league?.scoringCategories)
      return [] as Array<{
        name: string;
        teamPaceStr: string;
        withPlayerStr: string;
        deltaStr: string;
        improved: boolean;
        neutral: boolean;
      }>;
    const relevantCats = league.scoringCategories.filter((cat) =>
      statView === "pitching"
        ? cat.type === "pitching"
        : cat.type === "batting",
    );
    return relevantCats.map((cat) => {
      const isRate = ["ERA", "WHIP"].includes(cat.name.toUpperCase());
      if (isRate) {
        const vals = myTeamEntries
          .map((e) => {
            const player = allPlayers.find((a) => a.id === e.externalPlayerId);
            if (!player) return 0;
            return getStatByCategory(player, cat.name, cat.type);
          })
          .filter((v) => v > 0);
        const teamPace = vals.length
          ? vals.reduce((a, b) => a + b, 0) / vals.length
          : 0;
        const playerStat = getStatByCategory(
          selectedPlayer,
          cat.name,
          cat.type,
        );
        // If either side has no data, can't compute a meaningful delta
        if (teamPace === 0 || playerStat === 0) {
          return {
            name: cat.name,
            teamPaceStr: teamPace > 0 ? teamPace.toFixed(2) : "—",
            withPlayerStr: playerStat > 0 ? playerStat.toFixed(2) : "—",
            deltaStr: "—",
            improved: false,
            neutral: true,
          };
        }
        // For ERA/WHIP, lower is better — positive delta means player improves the team.
        // Compute the actual new team average after including this player.
        const sum = vals.reduce((a, b) => a + b, 0);
        const newTeamAvg = +((sum + playerStat) / (vals.length + 1)).toFixed(2);
        const delta = +(teamPace - newTeamAvg).toFixed(2);
        return {
          name: cat.name,
          teamPaceStr: teamPace.toFixed(2),
          withPlayerStr: newTeamAvg.toFixed(2),
          deltaStr: delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2),
          improved: delta > 0,
          neutral: delta === 0,
        };
      } else {
        const teamPace = myTeamEntries.reduce((sum, entry) => {
          const player = allPlayers.find(
            (a) => a.id === entry.externalPlayerId,
          );
          return player
            ? sum + getStatByCategory(player, cat.name, cat.type)
            : sum;
        }, 0);
        const playerStat = getStatByCategory(
          selectedPlayer,
          cat.name,
          cat.type,
        );
        return {
          name: cat.name,
          teamPaceStr: Math.round(teamPace).toString(),
          withPlayerStr: Math.round(teamPace + playerStat).toString(),
          deltaStr:
            playerStat > 0
              ? `+${Math.round(playerStat)}`
              : Math.round(playerStat).toString(),
          improved: playerStat > 0,
          neutral: playerStat === 0,
        };
      }
    });
  })();

  const teamNames = league?.teamNames ?? [];
  const allSlotOptions = league?.rosterSlots
    ? Object.keys(league.rosterSlots)
    : ["SP", "RP", "C", "1B", "2B", "SS", "3B", "OF", "UTIL", "BN"];

  function getAvailableSlots(
    teamName: string,
    slots: string[],
    roster: RosterEntry[],
  ): Set<string> {
    if (!league) return new Set(slots);
    const teamIdx = league.teamNames.indexOf(teamName);
    if (teamIdx === -1) return new Set(slots);
    const teamId = `team_${teamIdx + 1}`;
    const teamRoster = roster.filter((e) => e.teamId === teamId);
    const filled = new Map<string, number>();
    teamRoster.forEach((e) => {
      filled.set(e.rosterSlot, (filled.get(e.rosterSlot) ?? 0) + 1);
    });
    return new Set(
      slots.filter((s) => (filled.get(s) ?? 0) < (league.rosterSlots[s] ?? 1)),
    );
  }

  const eligible = selectedPlayer
    ? getEligibleSlotsForPositions(
        selectedPlayer.positions,
        allSlotOptions,
        selectedPlayer.position,
      )
    : allSlotOptions;
  const available = getAvailableSlots(wonBy, allSlotOptions, rosterEntries);
  const slotOptions = eligible.filter((s) => available.has(s));

  const hittingCats = (league?.scoringCategories ?? []).filter(
    (c) => c.type === "batting",
  );
  const pitchingCats = (league?.scoringCategories ?? []).filter(
    (c) => c.type === "pitching",
  );

  // Auto-correct draftedToSlot when player or team changes
  useEffect(() => {
    if (slotOptions.length > 0 && !slotOptions.includes(draftedToSlot)) {
      setDraftedToSlot(slotOptions[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlayer?.id, wonBy]);

  return (
    <div className="cc-center">
      {/* Search bar + undo/redo */}
      <div className="cc-search-wrap" ref={searchRef}>
        <div className="cc-search-inner">
          <div className="auction-search-bar">
            <span className="auction-search-icon">⊕</span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder={
                selectedPlayer
                  ? `${selectedPlayer.name} — type to switch...`
                  : "Search player to load into auction..."
              }
              className="auction-search-input"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowDropdown(e.target.value.length >= 1);
              }}
              onFocus={() => {
                if (searchQuery.length >= 1) setShowDropdown(true);
              }}
            />
            {selectedPlayer && (
              <button
                className="cc-clear-btn"
                onClick={() => {
                  setSelectedPlayer(null);
                  setSearchQuery("");
                }}
              >
                ✕
              </button>
            )}
            <div className="cc-undo-redo">
              <button
                className="cc-ur-btn"
                title="Undo last pick"
                disabled={rosterEntries.length === 0}
                onClick={() => void handleUndo()}
              >
                ↩
              </button>
              <button
                className="cc-ur-btn"
                title="Redo last pick"
                disabled={redoStack.length === 0}
                onClick={() => void handleRedo()}
              >
                ↪
              </button>
            </div>
          </div>
          {/* {showDropdown && dropdownResults.length > 0 && (
            <div className="cc-search-dropdown">
              {dropdownResults.map((p) => (
                <button
                  key={p.id}
                  className="cc-dropdown-item"
                  onMouseDown={() => handleSelectPlayer(p)}
                >
                  <PosBadge pos={p.position} />
                  <span className="cc-dd-name">
                    {p.name}
                    {p.injuryStatus && (
                      <span className="pt-il-badge">
                        {p.injuryStatus.replace("DL", "IL")}
                      </span>
                    )}
                    {isInWatchlist(p.id) && (
                      <span className="cc-dd-wl" title="On your watchlist">
                        ★
                      </span>
                    )}
                  </span>
                  <span className="cc-dd-team">{p.team}</span>
                  <span className="cc-dd-val">${p.value}</span>
                </button>
              ))}
            </div>
          )} */}
          {showDropdown && (
            <div className="cc-search-dropdown">
              {dropdownResults.length > 0 ? (
                dropdownResults.map((p) => (
                  <button
                    key={p.id}
                    className="cc-dropdown-item"
                    onMouseDown={() => handleSelectPlayer(p)}
                  >
                    <PosBadge pos={p.position} />
                    <span className="cc-dd-name">
                      {p.name}
                      {p.injuryStatus && (
                        <span className="pt-il-badge">
                          {p.injuryStatus.replace("DL", "IL")}
                        </span>
                      )}
                      {isInWatchlist(p.id) && (
                        <span className="cc-dd-wl" title="On your watchlist">
                          ★
                        </span>
                      )}
                    </span>
                    <span className="cc-dd-team">{p.team}</span>
                    <span className="cc-dd-val">${p.value}</span>
                  </button>
                ))
              ) : searchQuery.length >= 2 ? (
                <div className="asd-no-results">
                  <span className="asd-no-results-text">
                    No players found for "{searchQuery}"
                  </span>
                  <button
                    className="asd-add-missing-btn"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setShowDropdown(false);
                      onAddMissingPlayer?.();
                    }}
                  >
                    <UserPlus size={13} />
                    Add "{searchQuery}" as custom player
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="cc-content-scroll">
        {!selectedPlayer ? (
          <div className="cc-empty-state">
            <div className="cc-empty-icon">⊕</div>
            <div className="cc-empty-title">No player loaded</div>
            <div className="cc-empty-sub">
              Search for a player above to begin the auction
            </div>
          </div>
        ) : (
          <div className="player-auction-card">
            <div className="pac-header">
              <div className="pac-name-row">
                <img
                  src={selectedPlayer.headshot}
                  alt={selectedPlayer.name}
                  className="pac-headshot"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <div className="pac-name-block">
                  <h1 className="pac-name">
                    {selectedPlayer.name}
                    {selectedPlayer.injuryStatus && (
                      <span className="pt-il-badge">
                        {selectedPlayer.injuryStatus.replace("DL", "IL")}
                      </span>
                    )}
                    {isInWatchlist(selectedPlayer.id) && (
                      <span className="pac-wl-badge" title="On your watchlist">
                        ★
                      </span>
                    )}
                  </h1>
                </div>
                <div className="pac-meta-row">
                  {(() => {
                    const valuationRow = valuationMap.get(selectedPlayer.id);
                    const values = getEngineDisplayValues(
                      valuationRow,
                      selectedPlayer.value,
                    );
                    const tierValue = valuationRow?.tier ?? selectedPlayer.tier;
                    const adpValue = valuationRow?.adp ?? selectedPlayer.adp;
                    return (
                      <>
                        <div
                          className="pac-stat pac-stat--value-primary"
                          title="Personalized value based on your roster and budget"
                        >
                          <span className="pac-stat-label">Your Value</span>
                          <span className="pac-stat-value pac-stat-value--money green">
                            ${Math.round(values.your)}
                          </span>
                        </div>
                        <div
                          className="pac-stat"
                          title="Expected auction price"
                        >
                          <span className="pac-stat-label">Likely Bid</span>
                          <span className="pac-stat-value pac-stat-value--money">
                            ${Math.round(values.likely)}
                          </span>
                        </div>
                        <div
                          className="pac-stat"
                          title="Model value based on league dynamics"
                        >
                          <span className="pac-stat-label">Market Value</span>
                          <span className="pac-stat-value pac-stat-value--money pac-stat-value--muted">
                            ${Math.round(values.market)}
                          </span>
                        </div>
                        <div className="pac-stat">
                          <span className="pac-stat-label">Pos</span>
                          <div
                            style={{ display: "flex", gap: "2px", flexWrap: "wrap" }}
                          >
                            {(selectedPlayer.positions?.length
                              ? selectedPlayer.positions
                              : [selectedPlayer.position]
                            ).map((pos) => (
                              <PosBadge key={pos} pos={pos} />
                            ))}
                          </div>
                        </div>
                        <div className="pac-stat">
                          <span className="pac-stat-label">Team</span>
                          <span className="pac-stat-value pac-stat-value--tiny">
                            {selectedPlayer.team}
                          </span>
                        </div>
                        <div
                          className="pac-stat"
                          title="Baseline model player strength"
                        >
                          <span className="pac-stat-label">Strength</span>
                          <span className="pac-stat-value pac-stat-value--tiny">
                            ${Math.round(values.strength)}
                          </span>
                        </div>
                        <div className="pac-stat">
                          <span className="pac-stat-label">Tier</span>
                          <span
                            className="pac-stat-value pac-tier-badge"
                            style={{
                              background:
                                [
                                  "#a855f7",
                                  "#6366f1",
                                  "#22c55e",
                                  "#f59e0b",
                                  "#6b7280",
                                ][tierValue - 1] ?? "#6b7280",
                            }}
                          >
                            {tierValue}
                          </span>
                        </div>
                        <div className="pac-stat">
                          <span className="pac-stat-label">Signal</span>
                          <span
                            className={
                              "pac-indicator " +
                              (valuationRow
                                ? valuationRow.indicator === "Steal"
                                  ? "pac-indicator--steal"
                                  : valuationRow.indicator === "Reach"
                                    ? "pac-indicator--reach"
                                    : "pac-indicator--fair"
                                : "pac-indicator--placeholder")
                            }
                            title={valuationRow?.why?.join(" · ")}
                          >
                            {valuationRow?.indicator ?? "—"}
                          </span>
                        </div>
                        <div
                          className="pac-stat"
                          title={
                            valuationRow?.adp != null
                              ? `Engine ADP (valuation row): ${valuationRow.adp}`
                              : "Catalog ADP"
                          }
                        >
                          <span className="pac-stat-label">ADP</span>
                          <span className="pac-stat-value">{adpValue}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            <div className="pac-snapshot-header">
              <span className="pac-section-label">PLAYER IMPACT</span>
              <div className="stat-view-toggle">
                <button
                  className={
                    "svt-btn " + (statView === "hitting" ? "active" : "")
                  }
                  onClick={() => setStatView("hitting")}
                >
                  Hitting
                </button>
                <button
                  className={
                    "svt-btn " + (statView === "pitching" ? "active" : "")
                  }
                  onClick={() => setStatView("pitching")}
                >
                  Pitching
                </button>
              </div>
            </div>

            {statView === "pitching" ? (
              <div className="pac-stat-boxes">
                {pitchingCats.length > 0 ? (
                  pitchingCats.map((cat) => {
                    const label =
                      cat.name.match(/\(([^)]+)\)$/)?.[1] ??
                      (cat.name === "Walks + Hits per IP" ? "WHIP" : cat.name);
                    const raw = selectedPlayer
                      ? getStatByCategory(selectedPlayer, cat.name, "pitching")
                      : 0;
                    const isRate = [
                      "ERA",
                      "WHIP",
                      "WALKS + HITS PER IP",
                    ].includes(cat.name.toUpperCase());
                    const display =
                      raw === 0
                        ? "--"
                        : isRate
                          ? raw.toFixed(2)
                          : String(Math.round(raw));
                    return (
                      <div key={cat.name} className="stat-box">
                        <div className="sb-label">{label}</div>
                        <div className="sb-val">{display}</div>
                      </div>
                    );
                  })
                ) : (
                  <>
                    <div className="stat-box">
                      <div className="sb-label">ERA</div>
                      <div className="sb-val">{sp?.era ?? "--"}</div>
                    </div>
                    <div className="stat-box">
                      <div className="sb-label">K/9</div>
                      <div className="sb-val">{k9}</div>
                    </div>
                    <div className="stat-box">
                      <div className="sb-label">WHIP</div>
                      <div className="sb-val">{sp?.whip ?? "--"}</div>
                    </div>
                    <div className="stat-box">
                      <div className="sb-label">W</div>
                      <div className="sb-val">{sp?.wins ?? "--"}</div>
                    </div>
                    <div className="stat-box">
                      <div className="sb-label">SV</div>
                      <div className="sb-val">{sp?.saves ?? "--"}</div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="pac-stat-boxes">
                {hittingCats.length > 0 ? (
                  hittingCats.map((cat) => {
                    const label =
                      cat.name.match(/\(([^)]+)\)$/)?.[1] ?? cat.name;
                    const raw = selectedPlayer
                      ? getStatByCategory(selectedPlayer, cat.name, "batting")
                      : 0;
                    const isRate = ["AVG", "OBP", "SLG"].includes(
                      cat.name.toUpperCase(),
                    );
                    const display =
                      raw === 0
                        ? "--"
                        : isRate
                          ? raw.toFixed(3)
                          : String(Math.round(raw));
                    return (
                      <div key={cat.name} className="stat-box">
                        <div className="sb-label">{label}</div>
                        <div className="sb-val">{display}</div>
                      </div>
                    );
                  })
                ) : (
                  <>
                    <div className="stat-box">
                      <div className="sb-label">AVG</div>
                      <div className="sb-val">{sb?.avg ?? ".---"}</div>
                    </div>
                    <div className="stat-box">
                      <div className="sb-label">HR</div>
                      <div className="sb-val">{sb?.hr ?? "--"}</div>
                    </div>
                    <div className="stat-box">
                      <div className="sb-label">RBI</div>
                      <div className="sb-val">{sb?.rbi ?? "--"}</div>
                    </div>
                    <div className="stat-box">
                      <div className="sb-label">R</div>
                      <div className="sb-val">{sb?.runs ?? "--"}</div>
                    </div>
                    <div className="stat-box">
                      <div className="sb-label">SB</div>
                      <div className="sb-val">{sb?.sb ?? "--"}</div>
                    </div>
                  </>
                )}
              </div>
            )}

            {catImpactRows.length > 0 && (
              <>
                <div
                  className="pac-section-label"
                  style={{ marginTop: "0.75rem", marginBottom: "0.45rem" }}
                >
                  CATEGORY DELTA
                </div>
                <div className="cat-impact-boxes">
                  {catImpactRows.map((row) => (
                    <div key={row.name} className="ci-box">
                      <div className="ci-box-label">{row.name}</div>
                      <div
                        className={`ci-box-delta ${
                          row.neutral
                            ? "neutral"
                            : row.improved
                              ? "green"
                              : "red"
                        }`}
                      >
                        {row.deltaStr}
                      </div>
                      <div className="ci-box-sub">
                        {row.teamPaceStr}&nbsp;→&nbsp;{row.withPlayerStr}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Log result */}
            <div className="pac-section-label pac-log-result-label">LOG RESULT</div>
            <div className="log-result-grid log-result-grid--inline">
              <div className="log-field">
                <select
                  className="log-select"
                  value={wonBy}
                  onChange={(e) => setWonBy(e.target.value)}
                >
                  {teamNames.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="log-field">
                <div className="log-price-input-wrap">
                  <span className="log-dollar">$</span>
                  <input
                    type="text"
                    className="log-price-input"
                    value={finalPrice}
                    onChange={(e) => onFinalPriceChange(e.target.value)}
                    title="Bid amount; defaults to Engine adjusted $ when available"
                  />
                </div>
              </div>
              <div className="log-field">
                <select
                  className={
                    "log-select" +
                    (slotOptions.length === 0 ? " log-select--warn" : "")
                  }
                  value={draftedToSlot}
                  onChange={(e) => setDraftedToSlot(e.target.value)}
                >
                  {slotOptions.length === 0 && (
                    <option value="">— no eligible slots —</option>
                  )}
                  {slotOptions.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <button
                className="log-result-btn log-result-btn--inline"
                onClick={() => void handleLogResult()}
                disabled={
                  submitting || !wonBy || !finalPrice || slotOptions.length === 0
                }
              >
                {submitting ? "Logging…" : "Log"}
              </button>
            </div>

            <details
              className="pac-notes-collapsible"
              open={notesOpen}
              onToggle={(e) =>
                setNotesOpen((e.target as HTMLDetailsElement).open)
              }
            >
              <summary className="pac-notes-summary">NOTES</summary>
              <div className="pac-notes-grid">
                <div className="pac-notes-wrap">
                  <div className="pac-notes-label">PLAYER</div>
                  <textarea
                    className="pac-notes"
                    value={
                      (getNote(selectedPlayer.id) || selectedPlayer.outlook) ?? ""
                    }
                    onChange={(e) => {
                      setNote(selectedPlayer.id, e.target.value);
                    }}
                    placeholder="Scouting notes..."
                    rows={2}
                  />
                </div>
                <div className="pac-notes-wrap">
                  <div className="pac-notes-label">DRAFT</div>
                  <textarea
                    className="pac-notes"
                    value={getNote("__draft__")}
                    onChange={(e) => setNote("__draft__", e.target.value)}
                    placeholder="Draft strategy notes..."
                    rows={2}
                  />
                </div>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
