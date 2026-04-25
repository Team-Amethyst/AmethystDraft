import { useState, useEffect, useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useParams } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";
import { useLeague } from "../contexts/LeagueContext";
import type { League } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import type { Player } from "../types/player";
import { getPlayers } from "../api/players";
import { getRoster, removeRosterEntry, updateRosterEntry } from "../api/roster";
import type { RosterEntry } from "../api/roster";
import "./CommandCenter.css";
import { DraftLogRow } from "../components/DraftLogRow";
import { AuctionCenter } from "../components/AuctionCenter";
import PosBadge from "../components/PosBadge";
import {
  type TeamSummary,
  computeTeamData,
  computePositionMarket,
  buildProjectedStandings,
  LOWER_IS_BETTER_CATS,
  computeRanks,
  rankColor,
  formatStatCell,
  teamCanBid,
  normalizeCatName,
} from "./commandCenterUtils";
import AddPlayerModal from "../components/AddPlayerModal";
import { useCustomPlayers } from "../hooks/useCustomPlayers";
import {
  getValuation,
  type ValuationResponse,
} from "../api/engine";
import { resolveUserTeamId } from "../utils/team";


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
  const sorted = [...rosterEntries]
    .filter((e) => !e.isKeeper)
    .sort(
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
              leagueBudget={league?.budget}
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
  selectedPlayerPositions,
  allPlayers,
  draftedIds,
  rosterEntries,
  onRemovePick,
  onUpdatePick,
  engineMarket,
}: {
  activeTab: string;
  setActiveTab: (t: string) => void;
  league: League | null;
  teamData: TeamSummary[];
  myTeamName: string;
  selectedPlayerPositions: string[];
  allPlayers: Player[];
  draftedIds: Set<string>;
  rosterEntries: RosterEntry[];
  onRemovePick: (id: string) => void;
  onUpdatePick: (
    id: string,
    data: { price?: number; rosterSlot?: string; teamId?: string },
  ) => void;
  engineMarket?: ValuationResponse | null;
}) {
  const eligibleMarketPositions = useMemo(
    () => [...new Set(selectedPlayerPositions)],
    [selectedPlayerPositions],
  );
  const [activeMarketPosition, setActiveMarketPosition] = useState<string | null>(
    eligibleMarketPositions[0] ?? null,
  );

  useEffect(() => {
    if (eligibleMarketPositions.length === 0) {
      setActiveMarketPosition(null);
      return;
    }
    setActiveMarketPosition((prev) =>
      prev && eligibleMarketPositions.includes(prev)
        ? prev
        : eligibleMarketPositions[0],
    );
  }, [eligibleMarketPositions]);

  const posMarket = useMemo(
    () => {
      const engineTierValueMap =
        engineMarket != null
          ? new Map(
              engineMarket.valuations.map((v) => [
                v.player_id,
                {
                  tier: v.tier,
                  value: v.adjusted_value,
                },
              ]),
            )
          : undefined;
      return (
      computePositionMarket(
        activeMarketPosition,
        allPlayers,
        draftedIds,
        rosterEntries,
        engineTierValueMap,
      )
      );
    },
    [activeMarketPosition, allPlayers, draftedIds, rosterEntries, engineMarket],
  );

  const playerMap = useMemo(
    () => new Map(allPlayers.map((p) => [p.id, p])),
    [allPlayers],
  );

  const FALLBACK_CATS = [
    { name: "HR", type: "batting" as const },
    { name: "RBI", type: "batting" as const },
    { name: "SB", type: "batting" as const },
    { name: "AVG", type: "batting" as const },
    { name: "W", type: "pitching" as const },
    { name: "SV", type: "pitching" as const },
    { name: "ERA", type: "pitching" as const },
    { name: "WHIP", type: "pitching" as const },
  ];

  const scoringCats = (
    league?.scoringCategories?.length ? league.scoringCategories : FALLBACK_CATS
  ).map((c) => ({ ...c, name: normalizeCatName(c.name) }));

  const [sortCat, setSortCat] = useState<string>("HR");
  const [sortAsc, setSortAsc] = useState(false);

  type LiqCol = "name" | "remaining" | "open" | "maxBid" | "ppSpot";
  const [liqSort, setLiqSort] = useState<{ col: LiqCol; dir: "asc" | "desc" }>({
    col: "maxBid",
    dir: "desc",
  });
  const toggleLiqSort = (col: LiqCol) =>
    setLiqSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: col === "name" ? "asc" : "desc" },
    );

  type TeamCol = "name" | "remaining" | "spent" | "open" | "maxBid";
  const [teamSort, setTeamSort] = useState<{
    col: TeamCol;
    dir: "asc" | "desc";
  }>({ col: "name", dir: "asc" });
  const toggleTeamSort = (col: TeamCol) =>
    setTeamSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: col === "name" ? "asc" : "desc" },
    );

  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const toggleTeamExpand = (name: string) =>
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });

  const TEAM_SLOT_ORDER = [
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
    "P",
    "BN",
  ];
  const teamSlotMap = useMemo(() => {
    type SlotEntry = {
      position: string;
      playerName: string | null;
      playerTeam: string | null;
      price: number | null;
      isKeeper: boolean;
    };
    const map = new Map<string, SlotEntry[]>();
    if (!league) return map;
    const orderedPositions = [
      ...TEAM_SLOT_ORDER.filter((p) => league.rosterSlots[p] !== undefined),
      ...Object.keys(league.rosterSlots).filter(
        (p) => !TEAM_SLOT_ORDER.includes(p),
      ),
    ];
    league.teamNames.forEach((name, i) => {
      const teamId = `team_${i + 1}`;
      const teamEntries = rosterEntries.filter((e) => e.teamId === teamId);
      const slots: SlotEntry[] = [];
      const usedIds = new Set<string>();
      for (const pos of orderedPositions) {
        const count = league.rosterSlots[pos] ?? 0;
        const posEntries = teamEntries.filter(
          (e) => e.rosterSlot === pos && !usedIds.has(e._id),
        );
        for (let j = 0; j < count; j++) {
          const entry = posEntries[j];
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
      map.set(name, slots);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, rosterEntries]);

  const sortedTeamData = useMemo(() => {
    const { col, dir } = liqSort;
    return [...teamData].sort((a, b) => {
      const av = col === "name" ? a.name : a[col];
      const bv = col === "name" ? b.name : b[col];
      const diff =
        typeof av === "string"
          ? av.localeCompare(bv as string)
          : (av as number) - (bv as number);
      return dir === "asc" ? diff : -diff;
    });
  }, [teamData, liqSort]);

  const projectedStandings = useMemo(
    () =>
      buildProjectedStandings(
        league?.teamNames ?? [],
        rosterEntries,
        playerMap,
        scoringCats,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league?.teamNames?.join(","), rosterEntries, playerMap, scoringCats],
  );

  const rankMaps = useMemo(
    () =>
      Object.fromEntries(
        scoringCats.map((c) => [
          c.name,
          computeRanks(projectedStandings, c.name),
        ]),
      ),
    [projectedStandings, scoringCats],
  );

  const sortedProjStandings = useMemo(() => {
    return [...projectedStandings].sort((a, b) => {
      const diff = (a.stats[sortCat] ?? 0) - (b.stats[sortCat] ?? 0);
      const ranked = LOWER_IS_BETTER_CATS.has(sortCat.toUpperCase())
        ? diff
        : -diff;
      return sortAsc ? -ranked : ranked;
    });
  }, [projectedStandings, sortCat, sortAsc]);

  const toggleSort = (cat: string) => {
    if (cat === sortCat) setSortAsc((v) => !v);
    else {
      setSortCat(cat);
      setSortAsc(false);
    }
  };

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
              {posMarket && <PosBadge pos={posMarket.position} />}
            </div>
            {eligibleMarketPositions.length > 1 ? (
              <div className="market-pos-tabs" aria-label="Market position scope">
                {eligibleMarketPositions.map((pos) => (
                  <button
                    key={pos}
                    className={
                      "market-pos-tab " +
                      (pos === activeMarketPosition ? "active" : "")
                    }
                    onClick={() => setActiveMarketPosition(pos)}
                    title={`Show market + scarcity for ${pos}`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="market-stat-row">
              <span className="msr-label">AVG WINNING PRICE</span>
              <span className="msr-value">
                {posMarket && posMarket.avgWinPrice > 0
                  ? `$${posMarket.avgWinPrice}`
                  : "—"}
              </span>
            </div>
            <div
              className="market-stat-row"
              title="Draftroom catalog list $ mean for undrafted players at this position"
            >
              <span className="msr-label">DRAFTROOM AVG $</span>
              <span className="msr-value green">
                {posMarket && posMarket.avgProjValue > 0
                  ? `$${posMarket.avgProjValue}`
                  : "—"}
              </span>
            </div>
            <div
              className="market-stat-row"
              title="Draftroom-local: avg auction price paid at this position vs Draftroom avg $ (not Engine inflation)"
            >
              <span className="msr-label">DRAFTROOM SPEND VS $</span>
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
            {posMarket ? (
              <div
                className="msr-count-rank-footnote"
                title="Draftroom rank by undrafted player count across positions (descriptive only)"
              >
                Draftroom count rank: {posMarket.scarcityRankNum} /{" "}
                {posMarket.scarcityRankOf}
              </div>
            ) : null}
            <div className="cc-divider" />
          </>
          <div className="market-section-label">TEAM LIQUIDITY</div>
          <table className="liquidity-table">
            <thead>
              <tr>
                {(
                  [
                    ["name", "TEAM"],
                    ["remaining", "$ LEFT"],
                    ["open", "OPEN"],
                    ["maxBid", "MAX BID"],
                    ["ppSpot", "$/SPOT"],
                  ] as [LiqCol, string][]
                ).map(([col, label]) => (
                  <th
                    key={col}
                    className="liq-th-sortable"
                    onClick={() => toggleLiqSort(col)}
                  >
                    {label}
                    {liqSort.col === col ? (
                      <span className="th-sort-icon th-sort-active">
                        {liqSort.dir === "asc" ? "▲" : "▼"}
                      </span>
                    ) : (
                      <span className="th-sort-icon th-sort-idle">↕</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTeamData.length > 0 ? (
                sortedTeamData.map((t) => {
                  const ineligible =
                    selectedPlayerPositions.length > 0 &&
                    !!league &&
                    !teamCanBid(
                      t.name,
                      selectedPlayerPositions,
                      league,
                      rosterEntries,
                    );
                  return (
                    <tr
                      key={t.name}
                      className={[
                        t.name === myTeamName ? "my-team-row" : "",
                        ineligible ? "liq-ineligible" : "",
                      ]
                        .join(" ")
                        .trim()}
                    >
                      <td className="liq-team-name-cell" title={t.name}>
                        {t.name}
                      </td>
                      <td>${t.remaining}</td>
                      <td>{t.open}</td>
                      <td className={ineligible ? "" : "green"}>${t.maxBid}</td>
                      <td>${t.ppSpot}</td>
                    </tr>
                  );
                })
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
        </div>
      )}

      {activeTab === "Teams" && (
        <div className="cc-panel-content cc-panel-content--log">
          <div className="cc-panel-above-log">
            <table className="teams-table">
              <thead>
                <tr>
                  {(
                    [
                      ["name", "TEAM"],
                      ["remaining", "$ LEFT"],
                      ["spent", "SPENT"],
                      ["open", "OPEN"],
                      ["maxBid", "MAX"],
                    ] as [TeamCol, string][]
                  ).map(([col, label]) => (
                    <th
                      key={col}
                      className="liq-th-sortable"
                      onClick={() => toggleTeamSort(col)}
                    >
                      {label}
                      {teamSort.col === col ? (
                        <span className="th-sort-icon th-sort-active">
                          {teamSort.dir === "asc" ? "▲" : "▼"}
                        </span>
                      ) : (
                        <span className="th-sort-icon th-sort-idle">↕</span>
                      )}
                    </th>
                  ))}
                  <th style={{ width: 24 }} />
                </tr>
              </thead>
              <tbody>
                {teamData.length > 0 ? (
                  [...teamData]
                    .sort((a, b) => {
                      const { col, dir } = teamSort;
                      const av = a[col as keyof TeamSummary];
                      const bv = b[col as keyof TeamSummary];
                      const diff =
                        typeof av === "string"
                          ? (av as string).localeCompare(bv as string)
                          : (av as number) - (bv as number);
                      return dir === "asc" ? diff : -diff;
                    })
                    .map((t) => {
                      const expanded = expandedTeams.has(t.name);
                      const slots = teamSlotMap.get(t.name) ?? [];
                      return (
                        <>
                          <tr
                            key={t.name}
                            className={
                              (t.name === myTeamName ? "my-team-row" : "") +
                              " teams-table-row"
                            }
                            onClick={() => toggleTeamExpand(t.name)}
                          >
                            <td className="team-name-cell">{t.name}</td>
                            <td>${t.remaining}</td>
                            <td>${t.spent}</td>
                            <td>{t.open}</td>
                            <td className="green">${t.maxBid}</td>
                            <td className="teams-expand-icon">
                              {expanded ? (
                                <ChevronUp size={11} />
                              ) : (
                                <ChevronDown size={11} />
                              )}
                            </td>
                          </tr>
                          {expanded && (
                            <tr
                              key={t.name + "-slots"}
                              className="teams-slots-row"
                            >
                              <td colSpan={6} className="teams-slots-cell">
                                <div className="teams-slots-list">
                                  {slots.map((slot, i) => (
                                    <div
                                      key={`${slot.position}-${i}`}
                                      className={
                                        "lo-slot-row" +
                                        (slot.playerName
                                          ? " lo-slot-filled"
                                          : "") +
                                        (slot.isKeeper ? " lo-slot-keeper" : "")
                                      }
                                    >
                                      <PosBadge pos={slot.position} />
                                      {slot.playerName ? (
                                        <span className="lo-slot-player">
                                          {slot.playerName}
                                          {slot.playerTeam && (
                                            <span className="lo-slot-team">
                                              {" "}
                                              · {slot.playerTeam}
                                            </span>
                                          )}
                                        </span>
                                      ) : (
                                        <span className="lo-slot-empty">
                                          — empty —
                                        </span>
                                      )}
                                      {slot.price !== null && (
                                        <span className="lo-slot-price">
                                          ${slot.price}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="dim"
                      style={{ textAlign: "center", padding: "1rem 0" }}
                    >
                      {league ? "No teams yet" : "No league loaded"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="cc-draft-log-section">
            <DraftLog
              rosterEntries={rosterEntries}
              league={league}
              allPlayers={allPlayers}
              onRemovePick={onRemovePick}
              onUpdatePick={onUpdatePick}
            />
          </div>
        </div>
      )}

      {activeTab === "Standings" && (
        <div className="cc-panel-content cc-panel-content--log">
          <div className="cc-panel-above-log">
            <div className="cc-standings-scroll">
              <table className="lo-standings-table">
                <thead>
                  <tr>
                    <th className="lo-th-team">TEAM</th>
                    {scoringCats.map((c) => (
                      <th
                        key={c.name}
                        className={
                          "lo-th-stat" +
                          (sortCat === c.name ? " lo-th-active" : "")
                        }
                        onClick={() => toggleSort(c.name)}
                      >
                        {c.name}
                        {sortCat === c.name ? (
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
                  {sortedProjStandings.map((row, idx) => (
                    <tr
                      key={row.teamName}
                      className={idx % 2 === 0 ? "lo-tr-even" : ""}
                    >
                      <td className="lo-td-team">{row.teamName}</td>
                      {scoringCats.map((c) => {
                        const rank = rankMaps[c.name]?.get(row.teamName) ?? 1;
                        const colorClass = rankColor(
                          rank,
                          sortedProjStandings.length,
                        );
                        const val = row.stats[c.name] ?? 0;
                        return (
                          <td
                            key={c.name}
                            className={`lo-td-stat ${colorClass}`}
                          >
                            {formatStatCell(c.name, val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="cc-draft-log-section">
            <DraftLog
              rosterEntries={rosterEntries}
              league={league}
              allPlayers={allPlayers}
              onRemovePick={onRemovePick}
              onUpdatePick={onUpdatePick}
            />
          </div>
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
  engineMarket,
}: {
  league: League | null;
  teamData: TeamSummary[];
  myTeamName: string;
  myTeamEntries: RosterEntry[];
  engineMarket: ValuationResponse | null;
}) {
  const my = teamData.find((t) => t.name === myTeamName);
  const totalSlots = league
    ? Object.values(league.rosterSlots).reduce((a, b) => a + b, 0)
    : 0;

  const budgetRemaining = my?.remaining ?? league?.budget ?? 260;
  const openSpots = my?.open ?? totalSlots;
  const maxBid = my?.maxBid ?? Math.max(1, budgetRemaining - (openSpots - 1));
  const ppSpot = my?.ppSpot ?? 0;
  const inflationFactor =
    engineMarket?.context_v2?.market_summary.inflation_factor ??
    engineMarket?.inflation_factor;
  const inflationPct =
    engineMarket?.context_v2?.market_summary.inflation_percent_vs_neutral ??
    (inflationFactor != null ? Math.round((inflationFactor - 1) * 100) : null);
  const marketClass =
    inflationFactor == null
      ? ""
      : inflationFactor >= 1.35
        ? "hot"
        : inflationFactor >= 1.15
          ? "warm"
          : inflationFactor <= 0.9
            ? "cool"
            : "neutral";
  // Position budget plan — read saved targets from MyDraft localStorage
  const savedPositionTargets: Record<string, number> = (() => {
    try {
      const raw = localStorage.getItem("amethyst-position-targets");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  })();

  const posBudgetPlan = league
    ? Object.entries(league.rosterSlots).map(([pos, count]) => {
        const entriesAtSlot = myTeamEntries.filter((e) => e.rosterSlot === pos);
        const spent = entriesAtSlot.reduce((s, e) => s + e.price, 0);
        const filled = entriesAtSlot.length;
        const open = Math.max(0, count - filled);
        const target =
          savedPositionTargets[pos] ??
          Math.round((count / totalSlots) * (league.budget ?? 260));
        const delta = target - spent;
        return { pos, open, target, spent, delta };
      })
    : [];

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
      <div className="rp-section-label">MARKET & BUDGET</div>
      {engineMarket ? (
        <div className={`engine-market-card ${marketClass}`}>
          <div className="engine-market-main">
            <div className="engine-market-kpi">
              <div className="em-label">Inflation</div>
              <div className="em-value em-value--inflation">
                {inflationFactor != null ? `${inflationFactor.toFixed(2)}x` : "—"}
              </div>
              <div className="em-sub">
                {inflationPct != null
                  ? `${inflationPct >= 0 ? "+" : ""}${inflationPct}%`
                  : "—"}
              </div>
            </div>
            <div className="engine-market-kpi">
              <div className="em-label">$ Left</div>
              <div className="em-value">${engineMarket.total_budget_remaining}</div>
            </div>
            <div className="engine-market-kpi">
              <div className="em-label">Players Left</div>
              <div className="em-value">{engineMarket.players_remaining}</div>
            </div>
          </div>
          <div className="engine-market-meta">
            {engineMarket.valuation_model_version
              ? `${engineMarket.valuation_model_version}`
              : "Engine model"}
          </div>
        </div>
      ) : (
        <div className="engine-market-empty">Engine market snapshot unavailable.</div>
      )}

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
          {posBudgetPlan.map(({ pos, open, target, spent, delta }) => {
            const pct = target > 0 ? spent / target : 0;
            const spentClass =
              pct > 1
                ? "red"
                : pct >= 0.8
                  ? "yellow"
                  : spent > 0
                    ? "green"
                    : "";
            const filled = open === 0;
            return (
              <tr key={pos} className={filled ? "dim" : ""}>
                <td className="pb-pos">{pos}</td>
                <td className={open === 0 ? "dim" : ""}>
                  {open === 0 ? "✓" : open}
                </td>
                <td>${target}</td>
                <td className={spentClass}>${spent}</td>
                <td className={delta >= 0 ? "green" : "red"}>
                  {delta >= 0 ? `+${delta}` : delta}
                </td>
              </tr>
            );
          })}
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
  // const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [mlbPlayers, setMlbPlayers] = useState<Player[]>([]);
  const { selectedPlayer, setSelectedPlayer } = useSelectedPlayer();
  const { customPlayers, addCustomPlayer } = useCustomPlayers();
  const [showAddModal, setShowAddModal] = useState(false);
  const [engineMarket, setEngineMarket] = useState<ValuationResponse | null>(
    null,
  );

  const allPlayers = useMemo(
    () => [...customPlayers, ...mlbPlayers],
    [customPlayers, mlbPlayers],
  );

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
    if (!leagueId || !token) return;
    let cancelled = false;
    const userTeamId = resolveUserTeamId(league, user?.id);
    void getValuation(leagueId, token, userTeamId)
      .then((res) => {
        if (!cancelled) setEngineMarket(res);
      })
      .catch(() => {
        if (!cancelled) setEngineMarket(null);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, token, rosterEntries.length, league, user?.id]);

  // useEffect(() => {
  //   void getPlayers("adp", league?.posEligibilityThreshold, league?.playerPool)
  //     .then(setAllPlayers)
  //     .catch(console.error);
  // }, [league?.posEligibilityThreshold, league?.playerPool]);
  useEffect(() => {
  void getPlayers("adp", league?.posEligibilityThreshold, league?.playerPool)
    .then(setMlbPlayers)
    .catch(console.error);
}, [league?.posEligibilityThreshold, league?.playerPool]);

  // If selectedPlayer was set from the watchlist (stub with mlbId 0 / no real data),
  // replace it with the full player once allPlayers is loaded.
  useEffect(() => {
    if (!selectedPlayer || selectedPlayer.mlbId !== 0) return;
    const full = allPlayers.find((p) => p.id === selectedPlayer.id);
    if (full) setSelectedPlayer(full);
  }, [allPlayers, selectedPlayer, setSelectedPlayer]);

  const draftedIds = useMemo(
    () => new Set(rosterEntries.map((e) => e.externalPlayerId)),
    [rosterEntries],
  );

  const teamData = useMemo(
    () => (league ? computeTeamData(league, rosterEntries) : []),
    [league, rosterEntries],
  );

  const myTeamIdx = user?.id && league ? league.memberIds.indexOf(user.id) : -1;
  const myTeamName = myTeamIdx >= 0 ? (league?.teamNames[myTeamIdx] ?? "") : "";
  const myTeamId = myTeamIdx >= 0 ? `team_${myTeamIdx + 1}` : null;
  const myTeamEntries = myTeamId
    ? rosterEntries.filter((e) => e.teamId === myTeamId)
    : [];

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

  // return (
  //   <div className="cc-page">
  //     <div className="cc-layout">
  //       <LeftPanel
  //         activeTab={activeTab}
  //         setActiveTab={setActiveTab}
  //         league={league}
  //         teamData={teamData}
  //         myTeamName={myTeamName}
  //         selectedPlayerPositions={
  //           selectedPlayer
  //             ? selectedPlayer.positions?.length
  //               ? selectedPlayer.positions
  //               : [selectedPlayer.position]
  //             : []
  //         }
  //         allPlayers={allPlayers}
  //         draftedIds={draftedIds}
  //         rosterEntries={rosterEntries}
  //         onRemovePick={handleRemovePick}
  //         onUpdatePick={handleUpdatePick}
  //       />
  //       <AuctionCenter
  //         rosterEntries={rosterEntries}
  //         refreshRoster={refreshRoster}
  //         allPlayers={allPlayers}
  //         selectedPlayer={selectedPlayer}
  //         setSelectedPlayer={setSelectedPlayer}
  //         draftedIds={draftedIds}
  //         myTeamEntries={myTeamEntries}
  //         showToast={showToast}
  //       />
  //       <RightPanel
  //         league={league}
  //         teamData={teamData}
  //         myTeamName={myTeamName}
  //         myTeamEntries={myTeamEntries}
  //         allPlayers={allPlayers}
  //         rosterEntries={rosterEntries}
  //       />
  //     </div>
  //     {toast && (
  //       <div className={`cc-toast cc-toast-${toast.type}`}>{toast.message}</div>
  //     )}
  //   </div>
  // );

  return (
    <div className="cc-page">
      <div className="cc-layout">
        <LeftPanel
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          league={league}
          teamData={teamData}
          myTeamName={myTeamName}
          selectedPlayerPositions={
            selectedPlayer
              ? selectedPlayer.positions?.length
                ? selectedPlayer.positions
                : [selectedPlayer.position]
              : []
          }
          allPlayers={allPlayers}
          draftedIds={draftedIds}
          rosterEntries={rosterEntries}
          onRemovePick={handleRemovePick}
          onUpdatePick={handleUpdatePick}
          engineMarket={engineMarket}
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
          // Pass the modal trigger down so AuctionCenter can open it
          // when a searched player is not found
          onAddMissingPlayer={() => setShowAddModal(true)}
        />
        <RightPanel
          league={league}
          teamData={teamData}
          myTeamName={myTeamName}
          myTeamEntries={myTeamEntries}
          engineMarket={engineMarket}
        />
      </div>
  
      {toast && (
        <div className={`cc-toast cc-toast-${toast.type}`}>{toast.message}</div>
      )}
  
      {/* Add Missing Player modal */}
      <AddPlayerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={(player) => {
          addCustomPlayer(player);
          setSelectedPlayer(player);
          // onClose handles setShowAddModal(false) automatically
        }}
      />
    </div>
  );

}
