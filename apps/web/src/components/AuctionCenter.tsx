import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router";
import { useLeague } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import type { Player } from "../types/player";
import { addRosterEntry, removeRosterEntry } from "../api/roster";
import type { RosterEntry } from "../api/roster";
import { getStatByCategory } from "../pages/commandCenterUtils";

interface AuctionCenterProps {
  rosterEntries: RosterEntry[];
  refreshRoster: () => void;
  allPlayers: Player[];
  selectedPlayer: Player | null;
  setSelectedPlayer: (p: Player | null) => void;
  draftedIds: Set<string>;
  myTeamEntries: RosterEntry[];
  showToast: (message: string, type?: "success" | "error" | "info") => void;
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
}: AuctionCenterProps) {
  const { id: leagueId } = useParams<{ id: string }>();
  const { league } = useLeague();
  const { token } = useAuth();
  const { isInWatchlist } = useWatchlist();
  const { getNote, setNote } = usePlayerNotes();

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

  const [currentBid, setCurrentBid] = useState("");
  const [wonBy, setWonBy] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  const [draftedToSlot, setDraftedToSlot] = useState("");
  const [statView, setStatView] = useState<"hitting" | "pitching">("pitching");
  const [submitting, setSubmitting] = useState(false);
  const [redoStack, setRedoStack] = useState<RosterEntry[]>([]);

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

  // When a new player is selected, initialise stat view + price guess
  useEffect(() => {
    if (!selectedPlayer) return;
    const isPitcher = ["SP", "RP", "P"].includes(selectedPlayer.position);
    setStatView(isPitcher ? "pitching" : "hitting");
    setFinalPrice(String(selectedPlayer.value));
  }, [selectedPlayer]);

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
    const playerName = selectedPlayer.name;
    setSubmitting(true);
    setSelectedPlayer(null);
    setCurrentBid("");
    setFinalPrice("");
    try {
      await addRosterEntry(
        leagueId,
        {
          externalPlayerId: selectedPlayer.id,
          playerName: selectedPlayer.name,
          playerTeam: selectedPlayer.team,
          positions: [selectedPlayer.position],
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

  // Live price derived values
  const isP =
    selectedPlayer !== null &&
    ["SP", "RP", "P"].includes(selectedPlayer.position);
  const posEntries = rosterEntries.filter(
    (e) =>
      allPlayers.find((p) => p.id === e.externalPlayerId)?.position ===
      selectedPlayer?.position,
  );
  const marketAvg = selectedPlayer
    ? posEntries.length
      ? Math.round(
          posEntries.reduce((s, e) => s + e.price, 0) / posEntries.length,
        )
      : selectedPlayer.value
    : 0;
  const targetLow = selectedPlayer
    ? Math.max(1, Math.round(marketAvg * 0.93))
    : 0;
  const targetHigh = selectedPlayer ? Math.round(marketAvg * 1.1) : 0;

  // Category impact rows
  const catImpactRows = (() => {
    if (!selectedPlayer || !league?.scoringCategories)
      return [] as Array<{
        name: string;
        teamPaceStr: string;
        withPlayerStr: string;
        deltaStr: string;
        improved: boolean;
      }>;
    const relevantCats = league.scoringCategories.filter((cat) =>
      isP ? cat.type === "pitching" : cat.type === "batting",
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
        const delta = +(teamPace - playerStat).toFixed(2);
        return {
          name: cat.name,
          teamPaceStr: teamPace > 0 ? teamPace.toFixed(2) : "—",
          withPlayerStr: playerStat > 0 ? playerStat.toFixed(2) : "—",
          deltaStr: delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2),
          improved: delta > 0,
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
        };
      }
    });
  })();

  const teamNames = league?.teamNames ?? [];
  const allSlotOptions = league?.rosterSlots
    ? Object.keys(league.rosterSlots)
    : ["SP", "RP", "C", "1B", "2B", "SS", "3B", "OF", "UTIL", "BN"];

  function getEligibleSlots(pos: string, slots: string[]): string[] {
    const pos_ = pos.toUpperCase();
    return slots.filter((slot) => {
      const s = slot.toUpperCase();
      if (s === pos_) return true;
      if (s === "UTIL") return true;
      if (s === "BN" || s === "BENCH") return true;
      if (s === "MI") return ["SS", "2B"].includes(pos_);
      if (s === "CI") return ["1B", "3B"].includes(pos_);
      if (s === "OF") return ["OF", "LF", "CF", "RF"].includes(pos_);
      if (s === "P") return ["SP", "RP"].includes(pos_);
      return false;
    });
  }

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
    ? getEligibleSlots(selectedPlayer.position, allSlotOptions)
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
          {showDropdown && dropdownResults.length > 0 && (
            <div className="cc-search-dropdown">
              {dropdownResults.map((p) => (
                <button
                  key={p.id}
                  className="cc-dropdown-item"
                  onMouseDown={() => handleSelectPlayer(p)}
                >
                  <span className="cc-dd-pos">{p.position}</span>
                  <span className="cc-dd-name">
                    {p.name}
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
          )}
        </div>
      </div>

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
              <h1 className="pac-name">
                {selectedPlayer.name}
                {isInWatchlist(selectedPlayer.id) && (
                  <span className="pac-wl-badge" title="On your watchlist">
                    ★
                  </span>
                )}
              </h1>
              <div className="pac-meta-row">
                <div className="pac-stat">
                  <span className="pac-stat-label">Position</span>
                  <span className="pac-stat-value">
                    {selectedPlayer.position}
                  </span>
                </div>
                <div className="pac-stat">
                  <span className="pac-stat-label">Team</span>
                  <span className="pac-stat-value">{selectedPlayer.team}</span>
                </div>
                <div className="pac-stat">
                  <span className="pac-stat-label">Tier</span>
                  <span
                    className="pac-stat-value pac-tier-badge"
                    style={{
                      background:
                        ["#a855f7", "#6366f1", "#22c55e", "#f59e0b", "#6b7280"][
                          selectedPlayer.tier - 1
                        ] ?? "#6b7280",
                    }}
                  >
                    {selectedPlayer.tier}
                  </span>
                </div>
                <div className="pac-stat">
                  <span className="pac-stat-label">Proj</span>
                  <span className="pac-stat-value green">
                    ${selectedPlayer.value}
                  </span>
                </div>
                <div className="pac-stat">
                  <span className="pac-stat-label">ADP</span>
                  <span className="pac-stat-value">{selectedPlayer.adp}</span>
                </div>
              </div>
            </div>
          </div>

          <>
            <div className="pac-notes-label">PLAYER NOTES</div>
            <textarea
              className="pac-notes"
              value={
                (getNote(selectedPlayer.id) || selectedPlayer.outlook) ?? ""
              }
              onChange={(e) => {
                setNote(selectedPlayer.id, e.target.value);
              }}
              placeholder="Add scouting notes..."
              rows={2}
            />
          </>

          {/* Performance snapshot */}
          <div className="pac-snapshot-header">
            <span className="pac-section-label">PERFORMANCE SNAPSHOT</span>
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
                  const label = cat.name.match(/\(([^)]+)\)$/)?.[1] ?? cat.name;
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

          {/* Category impact */}
          {catImpactRows.length > 0 && (
            <>
              <div
                className="pac-section-label"
                style={{ marginTop: "1rem", marginBottom: "0.5rem" }}
              >
                CATEGORY IMPACT
              </div>
              <table className="category-impact-table">
                <thead>
                  <tr>
                    <th>CAT</th>
                    <th>TEAM PACE</th>
                    <th>WITH PLAYER</th>
                    <th>DELTA</th>
                  </tr>
                </thead>
                <tbody>
                  {catImpactRows.map((row) => (
                    <tr key={row.name}>
                      <td className="ci-cat">{row.name}</td>
                      <td>{row.teamPaceStr}</td>
                      <td>{row.withPlayerStr}</td>
                      <td>
                        <span
                          className={`delta-badge ${row.improved ? "green" : "red"}`}
                        >
                          {row.deltaStr}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Live price */}
          <div className="pac-section-label" style={{ marginTop: "1rem" }}>
            LIVE PRICE
          </div>
          <div className="live-price-row">
            <div className="lp-block">
              <div className="lp-label">CURRENT HIGH BID</div>
              <div className="lp-val bid">
                {currentBid ? `$${currentBid}` : "$—"}
              </div>
            </div>
            <div className="lp-block">
              <div className="lp-label">MARKET AVG</div>
              <div className="lp-val">${marketAvg}</div>
            </div>
            <div className="lp-block">
              <div className="lp-label">TARGET RANGE</div>
              <div className="lp-val green">
                ${targetLow}–${targetHigh}
              </div>
            </div>
          </div>

          <div className="bid-row">
            <input
              type="text"
              className="bid-input"
              placeholder="$ Current price..."
              value={currentBid}
              onChange={(e) => setCurrentBid(e.target.value)}
            />
            <button className="bid-star-btn">☆</button>
          </div>

          {/* Log result */}
          <div className="pac-section-label" style={{ marginTop: "1rem" }}>
            LOG RESULT
          </div>
          <div className="log-result-grid">
            <div className="log-field">
              <label className="log-label">WON BY</label>
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
              <label className="log-label">FINAL PRICE</label>
              <div className="log-price-input-wrap">
                <span className="log-dollar">$</span>
                <input
                  type="text"
                  className="log-price-input"
                  value={finalPrice}
                  onChange={(e) => setFinalPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="log-field">
              <label className="log-label">DRAFTED TO SLOT</label>
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
          </div>

          <button
            className="log-result-btn"
            onClick={() => void handleLogResult()}
            disabled={
              submitting || !wonBy || !finalPrice || slotOptions.length === 0
            }
          >
            {submitting ? "Logging…" : "Log Result"}
          </button>
        </div>
      )}
    </div>
  );
}
