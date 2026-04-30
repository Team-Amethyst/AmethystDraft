import { useState, useEffect, useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useLeague } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { getRoster, removeRosterEntry, updateRosterEntry } from "../api/roster";
import type { RosterEntry } from "../api/roster";
import type { Player } from "../types/player";
import { getPlayers } from "../api/players";
import { DraftLogRow } from "../components/DraftLogRow";
import PosBadge from "../components/PosBadge";
import { usePageTitle } from "../hooks/usePageTitle";
import {
  buildProjectedStandings,
  LOWER_IS_BETTER_CATS,
  formatStatCell,
  isStatCellEmpty,
  rankColor,
  computeRanks,
  normalizeCatName,
} from "./commandCenterUtils";
import "./LeagueOverview.css";

// ─── Slot display order ───────────────────────────────────────────────────────

const SLOT_ORDER = [
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "MI",
  "CI",
  "OF",
  "UTIL",
  "SP",
  "RP",
  "BN",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlotRow {
  position: string;
  playerName: string | null;
  playerTeam: string | null;
  price: number | null;
  isKeeper: boolean;
}

interface TeamData {
  teamId: string;
  teamName: string;
  slots: SlotRow[];
  rosterFilled: number;
  budgetRemaining: number;
  bidAvg: number;
  maxBid: number;
}

// ─── Build team data from real roster entries ─────────────────────────────────

function buildTeamData(
  teamIndex: number,
  teamName: string,
  rosterSlots: Record<string, number>,
  entries: RosterEntry[],
  budget: number,
): TeamData {
  const teamId = `team_${teamIndex + 1}`;
  const teamEntries = entries.filter((e) => e.teamId === teamId);

  const orderedPositions = [
    ...SLOT_ORDER.filter((pos) => rosterSlots[pos] !== undefined),
    ...Object.keys(rosterSlots).filter((pos) => !SLOT_ORDER.includes(pos)),
  ];

  const slots: SlotRow[] = [];
  const usedIds = new Set<string>();

  for (const pos of orderedPositions) {
    const count = rosterSlots[pos] ?? 0;
    const posEntries = teamEntries.filter(
      (e) => e.rosterSlot === pos && !usedIds.has(e._id),
    );
    for (let i = 0; i < count; i++) {
      const entry = posEntries[i];
      if (entry) usedIds.add(entry._id);
      slots.push({
        position: pos,
        playerName: entry?.playerName ?? null,
        playerTeam: entry?.playerTeam ?? null,
        price: entry?.price ?? null,
        isKeeper: entry?.isKeeper ?? false,
      });
    }
  }

  const filled = slots.filter((s) => s.playerName !== null).length;
  const totalSpent = teamEntries.reduce((sum, e) => sum + e.price, 0);
  const remaining = budget - totalSpent;
  const open = slots.length - filled;

  return {
    teamId,
    teamName,
    slots,
    rosterFilled: filled,
    budgetRemaining: remaining,
    bidAvg: open > 0 ? Math.round(remaining / open) : 0,
    maxBid: open > 0 ? remaining - (open - 1) : 0,
  };
}

// ─── Standings helpers ────────────────────────────────────────────────────────

const FALLBACK_CATS: { name: string; type: "batting" | "pitching" }[] = [
  { name: "HR", type: "batting" },
  { name: "RBI", type: "batting" },
  { name: "SB", type: "batting" },
  { name: "AVG", type: "batting" },
  { name: "W", type: "pitching" },
  { name: "SV", type: "pitching" },
  { name: "ERA", type: "pitching" },
  { name: "WHIP", type: "pitching" },
];

// ─── Team card ────────────────────────────────────────────────────────────────

function TeamCard({ data }: { data: TeamData }) {
  return (
    <div className="lo-team-card">
      <div className="lo-card-header">
        <div className="lo-card-name">{data.teamName}</div>
        <div className="lo-card-sub">
          {data.rosterFilled}/{data.slots.length} roster filled
        </div>
      </div>

      <div className="lo-card-stats">
        <div className="lo-stat-pill">
          <span className="lo-stat-label">REMAINING</span>
          <span className="lo-stat-value">${data.budgetRemaining}</span>
        </div>
        <div className="lo-stat-pill">
          <span className="lo-stat-label">BID AVG</span>
          <span className="lo-stat-value">${data.bidAvg}</span>
        </div>
        <div className="lo-stat-pill">
          <span className="lo-stat-label">MAX BID</span>
          <span className="lo-stat-value">
            {data.maxBid > 0 ? `$${data.maxBid}` : "—"}
          </span>
        </div>
      </div>

      <div className="lo-slots">
        {data.slots.map((slot, i) => (
          <div
            key={`${slot.position}-${i}`}
            className={
              "lo-slot-row" +
              (slot.playerName ? " lo-slot-filled" : "") +
              (slot.isKeeper ? " lo-slot-keeper" : "")
            }
          >
            <PosBadge pos={slot.position} />
            {slot.playerName ? (
              <span className="lo-slot-player">
                {slot.playerName}
                {slot.playerTeam && (
                  <span className="lo-slot-team"> · {slot.playerTeam}</span>
                )}
              </span>
            ) : (
              <span className="lo-slot-empty">— empty —</span>
            )}
            {slot.price !== null && (
              <span className="lo-slot-price">${slot.price}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LeagueOverview() {
  const { league } = useLeague();
  const { token } = useAuth();
  usePageTitle(league ? `${league.name} Overview` : "League Overview");

  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [sortCat, setSortCat] = useState<string>("HR");
  const [sortAsc, setSortAsc] = useState(false);
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

  useEffect(() => {
    if (!league || !token) return;
    setLoadingRoster(true);
    getRoster(league.id, token)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoadingRoster(false));
  }, [league?.id, token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getPlayers(undefined, league?.posEligibilityThreshold, league?.playerPool)
      .then(setAllPlayers)
      .catch(() => {});
  }, [league?.posEligibilityThreshold, league?.playerPool]);

  const teamNames = useMemo(
    () =>
      league
        ? (league.teamNames.length > 0
            ? league.teamNames
            : Array.from({ length: league.teams }, (_, i) => `Team ${i + 1}`)
          ).slice(0, league.teams)
        : [],
    [league],
  );

  const teamCards = useMemo(
    () =>
      teamNames.map((name, i) =>
        buildTeamData(
          i,
          name,
          league?.rosterSlots ?? {},
          entries,
          league?.budget ?? 260,
        ),
      ),
    [teamNames, entries, league?.rosterSlots, league?.budget],
  );

  const playerMap = useMemo(
    () => new Map(allPlayers.map((p) => [p.id, p])),
    [allPlayers],
  );

  const scoringCats = useMemo(
    () =>
      (league?.scoringCategories?.length
        ? league.scoringCategories
        : FALLBACK_CATS
      ).map((c) => ({ ...c, name: normalizeCatName(c.name) })),
    [league],
  );

  const allCatNames = useMemo(
    () => scoringCats.map((c) => c.name),
    [scoringCats],
  );

  const standings = useMemo(
    () => buildProjectedStandings(teamNames, entries, playerMap, scoringCats),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamNames.join(","), entries, playerMap, scoringCats],
  );

  const rankMaps = useMemo(
    () =>
      Object.fromEntries(
        allCatNames.map((cat) => [cat, computeRanks(standings, cat)]),
      ),
    [standings, allCatNames],
  );

  const sortedStandings = useMemo(() => {
    return [...standings].sort((a, b) => {
      const diff = (a.stats[sortCat] ?? 0) - (b.stats[sortCat] ?? 0);
      const ranked = LOWER_IS_BETTER_CATS.has(sortCat.toUpperCase())
        ? diff
        : -diff;
      return sortAsc ? -ranked : ranked;
    });
  }, [standings, sortCat, sortAsc]);

  const toggleSort = (cat: string) => {
    if (cat === sortCat) setSortAsc((v) => !v);
    else {
      setSortCat(cat);
      setSortAsc(false);
    }
  };

  const handleRemoveEntry = async (entryId: string) => {
    if (!league || !token) return;
    const entry = entries.find((e) => e._id === entryId);
    setEntries((prev) => prev.filter((e) => e._id !== entryId));
    try {
      await removeRosterEntry(league.id, entryId, token);
      showToast(`✕ Removed ${entry?.playerName ?? "pick"}`, "info");
    } catch {
      getRoster(league.id, token)
        .then(setEntries)
        .catch(() => {});
      showToast("Failed to remove pick", "error");
    }
  };

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

  const handleUpdateEntry = async (
    entryId: string,
    data: {
      price?: number;
      rosterSlot?: string;
      teamId?: string;
      keeperContract?: string;
    },
  ) => {
    if (!league || !token) return;
    const prev = entries.find((e) => e._id === entryId);
    setEntries((es) =>
      es.map((e) => (e._id === entryId ? { ...e, ...data } : e)),
    );
    try {
      await updateRosterEntry(league.id, entryId, data, token);
      const parts: string[] = [];
      if (data.teamId) {
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
      if (prev)
        setEntries((es) => es.map((e) => (e._id === entryId ? prev : e)));
      showToast(
        err instanceof Error ? err.message : "Failed to update pick",
        "error",
      );
    }
  };

  if (!league) return null;

  return (
    <div className="lo-page">
      <div className="lo-layout">
        {/* ── Left: Team Comparison ─────────────────────────────────────────── */}
        <div className="lo-left">
          <div className="lo-section-header">
            <span className="lo-section-title">TEAM COMPARISON</span>
            <span className="lo-section-meta">
              {teamNames.length} teams · scroll horizontally
            </span>
          </div>
          {loadingRoster ? (
            <div className="lo-loading">Loading roster…</div>
          ) : (
            <div className="lo-cards-scroll">
              {teamCards.map((card) => (
                <TeamCard key={card.teamId} data={card} />
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Standings ─────────────────────────────────────────────── */}
        <div className="lo-right">
          <div className="lo-section-header">
            <span className="lo-section-title">STANDINGS</span>
            <span className="lo-section-meta">
              pre-season projections · click column to sort
            </span>
          </div>

          <div className="lo-standings-wrap">
            <table className="lo-standings-table">
              <thead>
                <tr>
                  <th className="lo-th-team">TEAM</th>
                  {allCatNames.map((cat) => (
                    <th
                      key={cat}
                      className={
                        "lo-th-stat" + (sortCat === cat ? " lo-th-active" : "")
                      }
                      onClick={() => toggleSort(cat)}
                    >
                      {cat}
                      {sortCat === cat ? (
                        sortAsc ? (
                          <ChevronUp size={10} />
                        ) : (
                          <ChevronDown size={10} />
                        )
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedStandings.map((row, idx) => (
                  <tr
                    key={row.teamName}
                    className={idx % 2 === 0 ? "lo-tr-even" : ""}
                  >
                    <td className="lo-td-team">{row.teamName}</td>
                    {allCatNames.map((cat) => {
                      const rank = rankMaps[cat]?.get(row.teamName) ?? 1;
                      const val = row.stats[cat] ?? 0;
                      const empty = isStatCellEmpty(val);
                      const colorClass = empty
                        ? ""
                        : rankColor(rank, teamNames.length);
                      return (
                        <td
                          key={cat}
                          className={
                            "lo-td-stat" +
                            (empty
                              ? " lo-td-stat--empty"
                              : colorClass
                                ? ` ${colorClass}`
                                : "")
                          }
                        >
                          {formatStatCell(cat, val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lo-draft-log-section">
            <div className="lo-section-header">
              <span className="lo-section-title">DRAFT LOG</span>
              <span className="lo-section-meta">
                {entries.filter((e) => !e.isKeeper).length > 0
                  ? `${entries.filter((e) => !e.isKeeper).length} picks`
                  : "0 picks"}
              </span>
            </div>
            {entries.filter((e) => !e.isKeeper).length > 0 ? (
              <div className="lo-dl-list">
                {[...entries]
                  .filter((e) => !e.isKeeper)
                  .sort(
                    (a, b) =>
                      new Date(a.acquiredAt ?? a.createdAt ?? 0).getTime() -
                      new Date(b.acquiredAt ?? b.createdAt ?? 0).getTime(),
                  )
                  .map((entry, i) => {
                    const teamIdx = entry.teamId
                      ? parseInt(entry.teamId.replace("team_", ""), 10) - 1
                      : league.memberIds.indexOf(entry.userId);
                    const teamName =
                      teamIdx >= 0
                        ? (league.teamNames[teamIdx] ??
                          entry.teamId ??
                          entry.userId)
                        : (entry.teamId ?? entry.userId);
                    const player = playerMap.get(entry.externalPlayerId);
                    return (
                      <DraftLogRow
                        key={entry._id}
                        entry={entry}
                        pickNum={i + 1}
                        teamName={teamName}
                        headshot={player?.headshot}
                        slotOptions={slotOptions}
                        teamOptions={teamOptions}
                        allRosterEntries={entries}
                        leagueRosterSlots={league.rosterSlots}
                        onUpdate={handleUpdateEntry}
                        onRemove={handleRemoveEntry}
                      />
                    );
                  })}
              </div>
            ) : (
              <div className="lo-dl-empty">No picks yet.</div>
            )}
          </div>
        </div>
      </div>
      {toast && (
        <div className={`lo-toast lo-toast-${toast.type}`}>{toast.message}</div>
      )}
    </div>
  );
}
