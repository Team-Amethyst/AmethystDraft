import { useState, useEffect, useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useLeague } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { getRoster, removeRosterEntry, updateRosterEntry } from "../api/roster";
import type { RosterEntry } from "../api/roster";
import type { Player } from "../types/player";
import { getPlayers } from "../api/players";
import { DraftLogRow } from "../components/DraftLogRow";
import { usePageTitle } from "../hooks/usePageTitle";
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

interface StandingsRow {
  teamName: string;
  stats: Record<string, number>;
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

// ─── Placeholder standings (pre-season — no real stats yet) ──────────────────

const HIT_CATS = ["HR", "RBI", "SB", "AVG"];
const PIT_CATS = ["W", "SV", "ERA", "WHIP"];
const ALL_CATS = [...HIT_CATS, ...PIT_CATS];
const LOWER_IS_BETTER = new Set(["ERA", "WHIP"]);

function buildPlaceholderStandings(teamNames: string[]): StandingsRow[] {
  return teamNames.map((name) => ({
    teamName: name,
    stats: {
      HR: 0,
      RBI: 0,
      SB: 0,
      AVG: 0.0,
      W: 0,
      SV: 0,
      ERA: 0.0,
      WHIP: 0.0,
    },
  }));
}

function rankColor(rank: number, total: number): string {
  const pct = rank / total;
  if (pct <= 0.33) return "lo-rank-good";
  if (pct <= 0.66) return "lo-rank-mid";
  return "lo-rank-bad";
}

function computeRanks(rows: StandingsRow[], cat: string): Map<string, number> {
  const sorted = [...rows].sort((a, b) => {
    const diff = b.stats[cat] - a.stats[cat];
    return LOWER_IS_BETTER.has(cat) ? -diff : diff;
  });
  const ranks = new Map<string, number>();
  sorted.forEach((r, i) => ranks.set(r.teamName, i + 1));
  return ranks;
}

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
            <span className="lo-slot-pos">{slot.position}</span>
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
    getPlayers()
      .then(setAllPlayers)
      .catch(() => {});
  }, []);

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

  const standings = useMemo(
    () => buildPlaceholderStandings(teamNames),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamNames.join(",")],
  );

  const rankMaps = useMemo(
    () =>
      Object.fromEntries(
        ALL_CATS.map((cat) => [cat, computeRanks(standings, cat)]),
      ),
    [standings],
  );

  const sortedStandings = useMemo(() => {
    return [...standings].sort((a, b) => {
      const diff = a.stats[sortCat] - b.stats[sortCat];
      const ranked = LOWER_IS_BETTER.has(sortCat) ? diff : -diff;
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

  const handleUpdateEntry = async (
    entryId: string,
    data: { price?: number; rosterSlot?: string; teamId?: string },
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
              pre-season · click column to sort
            </span>
          </div>

          <div className="lo-standings-wrap">
            <table className="lo-standings-table">
              <thead>
                <tr>
                  <th className="lo-th-team">TEAM</th>
                  {ALL_CATS.map((cat) => (
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
                    {ALL_CATS.map((cat) => {
                      const rank = rankMaps[cat].get(row.teamName) ?? 1;
                      const colorClass = rankColor(rank, teamNames.length);
                      const val = row.stats[cat];
                      const display =
                        cat === "AVG"
                          ? val.toFixed(3)
                          : cat === "ERA" || cat === "WHIP"
                            ? val.toFixed(2)
                            : String(val);
                      return (
                        <td key={cat} className={`lo-td-stat ${colorClass}`}>
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {entries.length > 0 ? (
            <>
              <div className="lo-section-header">
                <span className="lo-section-title">DRAFT LOG</span>
                <span className="lo-section-meta">{entries.length} picks</span>
              </div>
              <div className="lo-dl-list">
                {[...entries]
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
                        mlbTeam={player?.team || entry.playerTeam}
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
            </>
          ) : (
            <>
              <div className="lo-section-header">
                <span className="lo-section-title">DRAFT LOG</span>
                <span className="lo-section-meta">0 picks</span>
              </div>
              <div className="lo-dl-empty">No picks yet.</div>
            </>
          )}
        </div>
      </div>
      {toast && (
        <div className={`lo-toast lo-toast-${toast.type}`}>{toast.message}</div>
      )}
    </div>
  );
}
