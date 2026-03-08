import { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";
import { useLeague } from "../contexts/LeagueContext";
import type { League } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import type { Player } from "../types/player";
import { getPlayers } from "../api/players";
import {
  addRosterEntry,
  getRoster,
  removeRosterEntry,
  updateRosterEntry,
} from "../api/roster";
import type { RosterEntry } from "../api/roster";
import "./CommandCenter.css";
import { DraftLogRow } from "../components/DraftLogRow";

// ─────────────────────────────────────────────────────────────────────────────
// Data helpers
// ─────────────────────────────────────────────────────────────────────────────

interface TeamSummary {
  name: string;
  spent: number;
  filled: number;
  open: number;
  remaining: number;
  maxBid: number;
  ppSpot: number;
}

function computeTeamData(
  league: League,
  entries: RosterEntry[],
): TeamSummary[] {
  const totalSlots = Object.values(league.rosterSlots).reduce(
    (a, b) => a + b,
    0,
  );
  return league.teamNames.map((name, i) => {
    const uid = league.memberIds[i] ?? "";
    const mine = entries.filter((e) => e.userId === uid);
    const spent = mine.reduce((s, e) => s + e.price, 0);
    const filled = mine.length;
    const open = Math.max(0, totalSlots - filled);
    const remaining = Math.max(0, league.budget - spent);
    const maxBid = open > 0 ? Math.max(1, remaining - (open - 1)) : 0;
    const ppSpot = open > 0 ? +(remaining / open).toFixed(1) : 0;
    return { name, spent, filled, open, remaining, maxBid, ppSpot };
  });
}

function getStatByCategory(
  player: Player,
  catName: string,
  catType: "batting" | "pitching",
): number {
  const name = catName.toUpperCase();
  if (catType === "batting") {
    const b = player.stats?.batting;
    if (!b) return 0;
    if (name === "HR") return b.hr;
    if (name === "RBI") return b.rbi;
    if (name === "R" || name === "RUNS") return b.runs;
    if (name === "SB") return b.sb;
    if (name === "AVG") return parseFloat(b.avg) || 0;
    if (name === "OBP") return parseFloat(b.obp) || 0;
    if (name === "SLG") return parseFloat(b.slg) || 0;
    return 0;
  } else {
    const p = player.stats?.pitching;
    if (!p) return 0;
    if (name === "W" || name === "WINS") return p.wins;
    if (name === "K" || name === "SO") return p.strikeouts;
    if (name === "ERA") return parseFloat(p.era) || 0;
    if (name === "WHIP" || name === "WALKS + HITS PER IP")
      return parseFloat(p.whip) || 0;
    if (name === "SV" || name === "SAVES") return p.saves;
    if (name === "IP") return parseFloat(p.innings) || 0;
    return 0;
  }
}

interface PositionMarket {
  position: string;
  avgWinPrice: number;
  avgProjValue: number;
  inflation: number;
  remainingCount: number;
  scarcityRankNum: number;
  scarcityRankOf: number;
  supply: Array<{ tier: number; count: number; avgVal: number | null }>;
}

function computePositionMarket(
  position: string | null,
  allPlayers: Player[],
  draftedIds: Set<string>,
  rosterEntries: RosterEntry[],
): PositionMarket | null {
  if (!position || allPlayers.length === 0) return null;
  const posPlayers = allPlayers.filter((p) => p.position === position);
  const draftedAtPos = posPlayers.filter((p) => draftedIds.has(p.id));
  const remaining = posPlayers.filter((p) => !draftedIds.has(p.id));
  const draftedEntries = rosterEntries.filter((e) =>
    draftedAtPos.some((p) => p.id === e.externalPlayerId),
  );
  const avgWinPrice = draftedEntries.length
    ? Math.round(
        draftedEntries.reduce((s, e) => s + e.price, 0) / draftedEntries.length,
      )
    : 0;
  const avgProjValue = remaining.length
    ? Math.round(remaining.reduce((s, p) => s + p.value, 0) / remaining.length)
    : 0;
  const inflation =
    avgWinPrice > 0 && avgProjValue > 0
      ? Math.round((avgWinPrice / avgProjValue - 1) * 100)
      : 0;

  const allPositions = [...new Set(allPlayers.map((p) => p.position))];
  const remainingByPos = allPositions
    .map((pos) => ({
      pos,
      count: allPlayers.filter(
        (p) => p.position === pos && !draftedIds.has(p.id),
      ).length,
    }))
    .sort((a, b) => a.count - b.count);
  const scarcityRankNum =
    remainingByPos.findIndex((r) => r.pos === position) + 1;
  const scarcityRankOf = remainingByPos.length;

  const allTiers = [...new Set(remaining.map((p) => p.tier))].sort(
    (a, b) => a - b,
  );
  const avgOrNull = (arr: Player[]) =>
    arr.length
      ? Math.round(arr.reduce((s, p) => s + p.value, 0) / arr.length)
      : null;

  return {
    position,
    avgWinPrice,
    avgProjValue,
    inflation,
    remainingCount: remaining.length,
    scarcityRankNum,
    scarcityRankOf,
    supply: allTiers.map((tier) => {
      const arr = remaining.filter((p) => p.tier === tier);
      return { tier, count: arr.length, avgVal: avgOrNull(arr) };
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function DraftLog({
  rosterEntries,
  league,
  allPlayers,
  onRemovePick,
  onUpdatePick,
}: {
  rosterEntries: RosterEntry[];
  league: League | null;
  allPlayers: Player[];
  onRemovePick?: (id: string) => void;
  onUpdatePick?: (
    id: string,
    data: { price?: number; rosterSlot?: string; teamId?: string },
  ) => void;
}) {
  const playerMap = useMemo(
    () => new Map(allPlayers.map((p) => [p.id, p])),
    [allPlayers],
  );
  const slotOptions = useMemo(
    () => (league?.rosterSlots ? Object.keys(league.rosterSlots) : []),
    [league],
  );
  const teamOptions = useMemo(
    () =>
      (league?.teamNames ?? []).map((name, i) => ({
        id: `team_${i + 1}`,
        name,
      })),
    [league],
  );
  const sorted = [...rosterEntries].sort(
    (a, b) =>
      new Date(a.acquiredAt ?? a.createdAt ?? 0).getTime() -
      new Date(b.acquiredAt ?? b.createdAt ?? 0).getTime(),
  );
  return (
    <>
      <div className="market-section-label" style={{ marginTop: "1rem" }}>
        DRAFT LOG
      </div>
      <div className="draft-log-list">
        {sorted.length === 0 && <div className="dl-empty">No picks yet.</div>}
        {sorted.map((entry, i) => {
          const teamIdx = entry.teamId
            ? parseInt(entry.teamId.replace("team_", ""), 10) - 1
            : (league?.memberIds.indexOf(entry.userId) ?? -1);
          const teamName =
            teamIdx >= 0
              ? (league?.teamNames[teamIdx] ?? entry.teamId ?? entry.userId)
              : (entry.teamId ?? entry.userId);
          const player = playerMap.get(entry.externalPlayerId);
          return (
            <DraftLogRow
              key={entry._id}
              entry={entry}
              pickNum={i + 1}
              teamName={teamName}
              headshot={player?.headshot}
              mlbTeam={player?.team || entry.playerTeam}
              slotOptions={slotOptions}
              teamOptions={teamOptions}
              allRosterEntries={rosterEntries}
              leagueRosterSlots={league?.rosterSlots ?? {}}
              onUpdate={onUpdatePick}
              onRemove={onRemovePick}
            />
          );
        })}
      </div>
    </>
  );
}

function LeftPanel({
  activeTab,
  setActiveTab,
  league,
  teamData,
  myTeamName,
  selectedPlayerPosition,
  allPlayers,
  draftedIds,
  rosterEntries,
  onRemovePick,
  onUpdatePick,
}: {
  activeTab: string;
  setActiveTab: (t: string) => void;
  league: League | null;
  teamData: TeamSummary[];
  myTeamName: string;
  selectedPlayerPosition: string | null;
  allPlayers: Player[];
  draftedIds: Set<string>;
  rosterEntries: RosterEntry[];
  onRemovePick: (id: string) => void;
  onUpdatePick: (
    id: string,
    data: { price?: number; rosterSlot?: string; teamId?: string },
  ) => void;
}) {
  const posMarket = useMemo(
    () =>
      computePositionMarket(
        selectedPlayerPosition,
        allPlayers,
        draftedIds,
        rosterEntries,
      ),
    [selectedPlayerPosition, allPlayers, draftedIds, rosterEntries],
  );

  return (
    <div className="cc-left">
      <div className="cc-tabs">
        {["Market", "Teams", "Standings"].map((t) => (
          <button
            key={t}
            className={"cc-tab " + (activeTab === t ? "active" : "")}
            onClick={() => setActiveTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === "Market" && (
        <div className="cc-panel-content">
          <>
            <div className="market-section-label">
              {posMarket ? posMarket.position : "—"} MARKET
              {posMarket && (
                <span className="pos-chip">{posMarket.position}</span>
              )}
            </div>
            <div className="market-stat-row">
              <span className="msr-label">AVG WINNING PRICE</span>
              <span className="msr-value">
                {posMarket && posMarket.avgWinPrice > 0
                  ? `$${posMarket.avgWinPrice}`
                  : "—"}
              </span>
            </div>
            <div className="market-stat-row">
              <span className="msr-label">PROJECTED VALUE</span>
              <span className="msr-value green">
                {posMarket && posMarket.avgProjValue > 0
                  ? `$${posMarket.avgProjValue}`
                  : "—"}
              </span>
            </div>
            <div className="market-stat-row">
              <span className="msr-label">INFLATION</span>
              <span
                className={`msr-value ${
                  posMarket && posMarket.inflation > 0
                    ? "yellow"
                    : posMarket && posMarket.inflation < 0
                      ? "green"
                      : ""
                }`}
              >
                {posMarket && posMarket.avgWinPrice > 0
                  ? `${posMarket.inflation > 0 ? "+" : ""}${posMarket.inflation}%`
                  : "—"}
              </span>
            </div>
            <div className="market-stat-row">
              <span className="msr-label">REMAINING AT POS</span>
              <span className="msr-value">
                {posMarket ? posMarket.remainingCount : "—"}
              </span>
            </div>
            <div className="market-stat-row">
              <span className="msr-label">SCARCITY RANK</span>
              <span className="msr-value">
                {posMarket ? (
                  <>
                    {posMarket.scarcityRankNum}{" "}
                    <span className="msr-sub">
                      / {posMarket.scarcityRankOf}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className="cc-divider" />
          </>
          <div className="market-section-label">TEAM LIQUIDITY</div>
          <table className="liquidity-table">
            <thead>
              <tr>
                <th>TEAM</th>
                <th>$ LEFT</th>
                <th>OPEN</th>
                <th>MAX BID ↓</th>
                <th>$/SPOT</th>
              </tr>
            </thead>
            <tbody>
              {teamData.length > 0 ? (
                teamData.map((t) => (
                  <tr
                    key={t.name}
                    className={t.name === myTeamName ? "my-team-row" : ""}
                  >
                    <td className="team-name-cell">{t.name}</td>
                    <td>${t.remaining}</td>
                    <td>{t.open}</td>
                    <td className="green">${t.maxBid}</td>
                    <td>${t.ppSpot}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="dim"
                    style={{ textAlign: "center", padding: "1rem 0" }}
                  >
                    {league ? "No picks logged yet" : "No league loaded"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <>
            <div className="cc-divider" />
            <div className="market-section-label">
              {posMarket ? posMarket.position : "—"} SUPPLY
            </div>
            <table className="supply-table">
              <thead>
                <tr>
                  <th>TIER</th>
                  <th>REMAINING</th>
                  <th>AVG $</th>
                </tr>
              </thead>
              <tbody>
                {posMarket ? (
                  posMarket.supply.length > 0 ? (
                    posMarket.supply.map(({ tier, count, avgVal }) => (
                      <tr key={tier}>
                        <td className="tier-cell">
                          <span
                            className="pac-tier-badge"
                            style={{
                              background:
                                [
                                  "#a855f7",
                                  "#6366f1",
                                  "#22c55e",
                                  "#f59e0b",
                                  "#6b7280",
                                ][tier - 1] ?? "#6b7280",
                            }}
                          >
                            {tier}
                          </span>
                        </td>
                        <td>{count}</td>
                        <td>{avgVal != null ? `$${avgVal}` : "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={3}
                        className="dim"
                        style={{ textAlign: "center", padding: "0.5rem 0" }}
                      >
                        None remaining
                      </td>
                    </tr>
                  )
                ) : (
                  <tr>
                    <td
                      colSpan={3}
                      className="dim"
                      style={{ textAlign: "center", padding: "0.5rem 0" }}
                    >
                      Select a player to see supply
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        </div>
      )}

      {activeTab === "Teams" && (
        <div className="cc-panel-content">
          <table className="teams-table">
            <thead>
              <tr>
                <th>TEAM</th>
                <th>$ LEFT</th>
                <th>SPENT</th>
                <th>OPEN</th>
                <th>MAX</th>
              </tr>
            </thead>
            <tbody>
              {teamData.length > 0 ? (
                teamData.map((t) => (
                  <tr
                    key={t.name}
                    className={t.name === myTeamName ? "my-team-row" : ""}
                  >
                    <td className="team-name-cell">{t.name}</td>
                    <td>${t.remaining}</td>
                    <td>${t.spent}</td>
                    <td>{t.open}</td>
                    <td className="green">${t.maxBid}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="dim"
                    style={{ textAlign: "center", padding: "1rem 0" }}
                  >
                    {league ? "No teams yet" : "No league loaded"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <DraftLog
            rosterEntries={rosterEntries}
            league={league}
            allPlayers={allPlayers}
            onRemovePick={onRemovePick}
            onUpdatePick={onUpdatePick}
          />
        </div>
      )}

      {activeTab === "Standings" && (
        <div className="cc-panel-content">
          <table className="standings-table">
            <thead>
              <tr>
                <th>#</th>
                <th>TEAM</th>
                <th>W</th>
                <th>L</th>
                <th>PCT</th>
                <th>GB</th>
              </tr>
            </thead>
            <tbody>
              {(league?.teamNames ?? []).map((name, i) => (
                <tr
                  key={name}
                  className={name === myTeamName ? "my-team-row" : ""}
                >
                  <td className="rank-cell">{i + 1}</td>
                  <td className="team-name-cell">{name}</td>
                  <td className="dim">—</td>
                  <td className="dim">—</td>
                  <td className="dim">—</td>
                  <td className="gb-cell dim">—</td>
                </tr>
              ))}
              {!league && (
                <tr>
                  <td
                    colSpan={6}
                    className="dim"
                    style={{ textAlign: "center", padding: "1rem 0" }}
                  >
                    No league loaded
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <DraftLog
            rosterEntries={rosterEntries}
            league={league}
            allPlayers={allPlayers}
            onRemovePick={onRemovePick}
            onUpdatePick={onUpdatePick}
          />
        </div>
      )}
    </div>
  );
}

function AuctionCenter({
  rosterEntries,
  refreshRoster,
  allPlayers,
  selectedPlayer,
  setSelectedPlayer,
  draftedIds,
  myTeamEntries,
  showToast,
}: {
  rosterEntries: RosterEntry[];
  refreshRoster: () => void;
  allPlayers: Player[];
  selectedPlayer: Player | null;
  setSelectedPlayer: (p: Player | null) => void;
  draftedIds: Set<string>;
  myTeamEntries: RosterEntry[];
  showToast: (message: string, type?: "success" | "error" | "info") => void;
}) {
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
      // Tier 0: full name starts with query
      if (full.startsWith(q)) return [{ p, score: 0 }];
      // Tier 1: any name part (first/last) starts with query
      if (parts.some((part) => part.startsWith(q))) return [{ p, score: 1 }];
      // Tier 2: any word in the name contains the query
      if (parts.some((part) => part.includes(q))) return [{ p, score: 2 }];
      // Tier 3: full name contains query (e.g. mid-word)
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
    const userId = league.memberIds[teamIdx];
    const price = parseInt(finalPrice, 10) || 1;
    const playerName = selectedPlayer.name;
    setSubmitting(true);
    // Dismiss player immediately
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

  // Which roster slots a player position is eligible to fill
  function getEligibleSlots(pos: string, slots: string[]): string[] {
    const pos_ = pos.toUpperCase();
    return slots.filter((slot) => {
      const s = slot.toUpperCase();
      if (s === pos_) return true;
      if (s === "UTIL") return true; // every position can fill UTIL
      if (s === "BN" || s === "BENCH") return true;
      if (s === "MI") return ["SS", "2B"].includes(pos_);
      if (s === "CI") return ["1B", "3B"].includes(pos_);
      if (s === "OF") return ["OF", "LF", "CF", "RF"].includes(pos_);
      if (s === "P") return ["SP", "RP"].includes(pos_);
      return false;
    });
  }

  // Slots still open on the chosen team (not yet at capacity)
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

function RightPanel({
  league,
  teamData,
  myTeamName,
  myTeamEntries,
  allPlayers,
  rosterEntries,
}: {
  league: League | null;
  teamData: TeamSummary[];
  myTeamName: string;
  myTeamEntries: RosterEntry[];
  allPlayers: Player[];
  rosterEntries: RosterEntry[];
}) {
  const my = teamData.find((t) => t.name === myTeamName);
  const totalSlots = league
    ? Object.values(league.rosterSlots).reduce((a, b) => a + b, 0)
    : 0;

  const budgetRemaining = my?.remaining ?? league?.budget ?? 260;
  const openSpots = my?.open ?? totalSlots;
  const maxBid = my?.maxBid ?? Math.max(1, budgetRemaining - (openSpots - 1));
  const ppSpot = my?.ppSpot ?? 0;

  const hittingCats = (league?.scoringCategories ?? []).filter(
    (c) => c.type === "batting",
  );
  const pitchingCats = (league?.scoringCategories ?? []).filter(
    (c) => c.type === "pitching",
  );

  // Position budget plan
  const posBudgetPlan = league
    ? Object.entries(league.rosterSlots).map(([pos, count]) => {
        const entriesAtSlot = myTeamEntries.filter((e) => e.rosterSlot === pos);
        const spent = entriesAtSlot.reduce((s, e) => s + e.price, 0);
        const filled = entriesAtSlot.length;
        const open = Math.max(0, count - filled);
        const target = Math.round(
          (count / totalSlots) * (league.budget ?? 260),
        );
        const delta = target - spent;
        return { pos, open, target, spent, delta };
      })
    : [];

  // Category pace percentages
  const numTeams = league?.teamNames?.length ?? 1;
  const allCats = [...hittingCats, ...pitchingCats];
  const catPace: Record<string, number> = {};
  for (const cat of allCats) {
    const isRate = ["ERA", "WHIP"].includes(cat.name.toUpperCase());
    const getVal = (entry: RosterEntry) => {
      const p = allPlayers.find((a) => a.id === entry.externalPlayerId);
      return p ? getStatByCategory(p, cat.name, cat.type) : 0;
    };
    if (isRate) {
      const myVals = myTeamEntries.map(getVal).filter((v) => v > 0);
      const allVals = rosterEntries.map(getVal).filter((v) => v > 0);
      const myAvg = myVals.length
        ? myVals.reduce((a, b) => a + b, 0) / myVals.length
        : 0;
      const allAvg = allVals.length
        ? allVals.reduce((a, b) => a + b, 0) / allVals.length
        : 0;
      catPace[cat.name] =
        allAvg > 0 && myAvg > 0 ? Math.round((allAvg / myAvg) * 100) : 0;
    } else {
      const myTotal = myTeamEntries.reduce((s, e) => s + getVal(e), 0);
      const allTotal = rosterEntries.reduce((s, e) => s + getVal(e), 0);
      const avgTotal = numTeams > 0 ? allTotal / numTeams : 0;
      catPace[cat.name] =
        avgTotal > 0 ? Math.round((myTotal / avgTotal) * 100) : 0;
    }
  }

  return (
    <div className="cc-right">
      <div className="rp-section-label">YOUR BUDGET</div>
      <div className="budget-grid">
        <div className="budget-card">
          <div className="bc-label">BUDGET REMAINING</div>
          <div className="bc-val green">${budgetRemaining}</div>
        </div>
        <div className="budget-card">
          <div className="bc-label">OPEN SPOTS</div>
          <div className="bc-val">{openSpots}</div>
        </div>
        <div className="budget-card">
          <div className="bc-label">MAX BID</div>
          <div className="bc-val green">${maxBid}</div>
        </div>
        <div className="budget-card">
          <div className="bc-label">$ PER SPOT</div>
          <div className="bc-val">${ppSpot}</div>
        </div>
      </div>
      <div className="budget-progress-row">
        <span className="bp-text">
          {my ? `${my.filled}/${totalSlots} filled` : `0/${totalSlots} filled`}
        </span>
        <span className="bp-text">${my?.spent ?? 0} spent</span>
      </div>

      <div className="cc-divider" />

      <div className="rp-section-label">POSITION BUDGET PLAN</div>
      <table className="pos-budget-table">
        <thead>
          <tr>
            <th>POS</th>
            <th>OPEN</th>
            <th>TARGET</th>
            <th>SPENT</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          {posBudgetPlan.map(({ pos, open, target, spent, delta }) => (
            <tr key={pos}>
              <td className="pb-pos">{pos}</td>
              <td>{open}</td>
              <td>${target}</td>
              <td>${spent}</td>
              <td className={delta >= 0 ? "green" : "red"}>
                {delta >= 0 ? `+${delta}` : delta}
              </td>
            </tr>
          ))}
          {posBudgetPlan.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="dim"
                style={{ textAlign: "center", padding: "0.5rem 0" }}
              >
                —
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="cc-divider" />

      <div className="rp-section-label">CATEGORY PACE</div>
      <div className="cat-pace-section">
        {hittingCats.length > 0 && (
          <>
            <div className="cat-pace-group-label">HITTING</div>
            <div className="cat-pace-row">
              {hittingCats.map((c) => {
                const pct = catPace[c.name] ?? 0;
                const color =
                  pct >= 95 ? "green" : pct >= 75 ? "yellow" : "red";
                return (
                  <div key={c.name} className="cat-pace-item">
                    <div className="cp-label">{c.name}</div>
                    {pct > 0 && <div className={`cp-pct ${color}`}>{pct}%</div>}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {pitchingCats.length > 0 && (
          <>
            <div
              className="cat-pace-group-label"
              style={{ marginTop: "0.6rem" }}
            >
              PITCHING
            </div>
            <div className="cat-pace-row">
              {pitchingCats.map((c) => {
                const pct = catPace[c.name] ?? 0;
                const color =
                  pct >= 95 ? "green" : pct >= 75 ? "yellow" : "red";
                return (
                  <div key={c.name} className="cat-pace-item">
                    <div className="cp-label">{c.name}</div>
                    {pct > 0 && <div className={`cp-pct ${color}`}>{pct}%</div>}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {hittingCats.length === 0 && pitchingCats.length === 0 && (
          <div
            className="dim"
            style={{ fontSize: "0.72rem", padding: "0.5rem 0" }}
          >
            Scoring categories not configured
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function CommandCenter() {
  usePageTitle("Command Center");
  const { id: leagueId } = useParams<{ id: string }>();
  const { league } = useLeague();
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState("Market");
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const { selectedPlayer, setSelectedPlayer } = useSelectedPlayer();

  // 1/2/3 → switch tabs (Market / Teams / Standings)
  useEffect(() => {
    const TABS = ["Market", "Teams", "Standings"];
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((document.activeElement as HTMLElement)?.isContentEditable) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= TABS.length) setActiveTab(TABS[n - 1]);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const refreshRoster = () => {
    if (!leagueId || !token) return;
    void getRoster(leagueId, token).then(setRosterEntries).catch(console.error);
  };

  useEffect(() => {
    if (!leagueId || !token) return;
    void getRoster(leagueId, token).then(setRosterEntries).catch(console.error);
  }, [leagueId, token]);

  useEffect(() => {
    void getPlayers("adp").then(setAllPlayers).catch(console.error);
  }, []);

  const draftedIds = useMemo(
    () => new Set(rosterEntries.map((e) => e.externalPlayerId)),
    [rosterEntries],
  );

  const teamData = useMemo(
    () => (league ? computeTeamData(league, rosterEntries) : []),
    [league, rosterEntries],
  );

  const myTeamName = (() => {
    if (!league || !user?.id) return "";
    const idx = league.memberIds.indexOf(user.id);
    return idx !== -1 ? (league.teamNames[idx] ?? "") : "";
  })();

  const myTeamEntries = rosterEntries.filter((e) => e.userId === user?.id);

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleRemovePick = async (entryId: string) => {
    if (!leagueId || !token) return;
    const entry = rosterEntries.find((e) => e._id === entryId);
    setRosterEntries((prev) => prev.filter((e) => e._id !== entryId));
    try {
      await removeRosterEntry(leagueId, entryId, token);
      showToast(`✕ Removed ${entry?.playerName ?? "pick"}`, "info");
    } catch (err) {
      refreshRoster();
      showToast(err instanceof Error ? err.message : "Remove failed", "error");
    }
  };

  const handleUpdatePick = async (
    entryId: string,
    data: { price?: number; rosterSlot?: string; teamId?: string },
  ) => {
    if (!leagueId || !token) return;
    const prev = rosterEntries.find((e) => e._id === entryId);
    setRosterEntries((entries) =>
      entries.map((e) => (e._id === entryId ? { ...e, ...data } : e)),
    );
    try {
      await updateRosterEntry(leagueId, entryId, data, token);
      const parts: string[] = [];
      if (data.teamId && league) {
        const idx = parseInt(data.teamId.replace("team_", ""), 10) - 1;
        const name = league.teamNames[idx] ?? data.teamId;
        parts.push(`team → ${name}`);
      }
      if (data.rosterSlot) parts.push(`slot → ${data.rosterSlot}`);
      if (data.price !== undefined) parts.push(`price → $${data.price}`);
      showToast(
        `✎ ${prev?.playerName ?? "Pick"} updated${parts.length ? ": " + parts.join(", ") : ""}`,
        "success",
      );
    } catch (err) {
      refreshRoster();
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    }
  };

  return (
    <div className="cc-page">
      <div className="cc-layout">
        <LeftPanel
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          league={league}
          teamData={teamData}
          myTeamName={myTeamName}
          selectedPlayerPosition={selectedPlayer?.position ?? null}
          allPlayers={allPlayers}
          draftedIds={draftedIds}
          rosterEntries={rosterEntries}
          onRemovePick={handleRemovePick}
          onUpdatePick={handleUpdatePick}
        />
        <AuctionCenter
          rosterEntries={rosterEntries}
          refreshRoster={refreshRoster}
          allPlayers={allPlayers}
          selectedPlayer={selectedPlayer}
          setSelectedPlayer={setSelectedPlayer}
          draftedIds={draftedIds}
          myTeamEntries={myTeamEntries}
          showToast={showToast}
        />
        <RightPanel
          league={league}
          teamData={teamData}
          myTeamName={myTeamName}
          myTeamEntries={myTeamEntries}
          allPlayers={allPlayers}
          rosterEntries={rosterEntries}
        />
      </div>
      {toast && (
        <div className={`cc-toast cc-toast-${toast.type}`}>{toast.message}</div>
      )}
    </div>
  );
}
