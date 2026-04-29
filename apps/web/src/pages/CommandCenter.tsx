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
  leagueWideAuctionSlotsRemaining,
} from "./commandCenterUtils";
import AddPlayerModal from "../components/AddPlayerModal";
import { useCustomPlayers } from "../hooks/useCustomPlayers";
import {
  getValuation,
  type ValuationResponse,
} from "../api/engine";
import { resolveUserTeamId } from "../utils/team";
import {
  leagueValuationConfigKey,
  rosterValuationFingerprint,
} from "../utils/valuationDeps";
import { readPositionTargetsFromStorage } from "../utils/positionTargetsStorage";
import { myDraftSlotsForPosition } from "../constants/positionAllocationPlan";


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
      <div className="market-section-label market-section-label--spaced">
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

function TeamMakeupSection({
  league,
  myTeamEntries,
  rosterEntries,
  savedPositionTargets,
  sectionClassName,
  headingClassName,
}: {
  league: League | null;
  myTeamEntries: RosterEntry[];
  rosterEntries: RosterEntry[];
  savedPositionTargets: Record<string, number>;
  sectionClassName: string;
  headingClassName: string;
}) {
  const totalSlots = league
    ? Object.values(league.rosterSlots).reduce((a, b) => a + b, 0)
    : 0;
  const teamOneEntries = rosterEntries.filter((e) => e.teamId === "team_1");
  const teamMakeupEntries = (teamOneEntries.length > 0 ? teamOneEntries : myTeamEntries)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.acquiredAt ?? a.createdAt ?? 0).getTime() -
        new Date(b.acquiredAt ?? b.createdAt ?? 0).getTime(),
    );
  const teamEntriesBySlot = new Map<string, RosterEntry[]>();
  teamMakeupEntries.forEach((entry) => {
    const slotKey = entry.rosterSlot || "BN";
    const curr = teamEntriesBySlot.get(slotKey) ?? [];
    curr.push(entry);
    teamEntriesBySlot.set(slotKey, curr);
  });
  const teamMakeupRows = league
    ? Object.entries(league.rosterSlots).flatMap(([slot, count]) => {
        const entriesForSlot = teamEntriesBySlot.get(slot) ?? [];
        const totalTargetForPosition =
          savedPositionTargets[slot] ??
          Math.round((count / totalSlots) * (league.budget ?? 260));
        /* My Draft “Per Slot” = total Target $ ÷ plan slots, not league slot count */
        const slotsForPerSlotDivisor = myDraftSlotsForPosition(slot) ?? count;
        const perSlotTarget =
          slotsForPerSlotDivisor > 0 && Number.isFinite(totalTargetForPosition)
            ? totalTargetForPosition / slotsForPerSlotDivisor
            : null;
        return Array.from({ length: count }, (_, idx) => {
          const entry = entriesForSlot[idx];
          return {
            key: `${slot}-${idx}`,
            slot,
            playerName: entry?.playerName ?? "— empty —",
            target: perSlotTarget,
            price: entry?.price ?? null,
            filled: !!entry,
          };
        });
      })
    : [];
  const fmtDollar = (n: number | null | undefined) =>
    n != null && Number.isFinite(n) ? `$${Math.round(n)}` : "—";
  const fmtPerSlotTarget = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return "—";
    const s = (Math.round(n * 10) / 10).toFixed(1);
    return `$${s.endsWith(".0") ? s.slice(0, -2) : s}`;
  };

  return (
    <section className={sectionClassName}>
      <div className={headingClassName}>TEAM MAKEUP</div>
      <div className="team-makeup-slots">
        <div className="team-makeup-head-row" aria-hidden>
          <span className="team-makeup-head-badge-spacer" />
          <div className="team-makeup-head-player">Player</div>
          <div className="team-makeup-head-money team-makeup-head-money--target-col">
            Target
          </div>
          <div className="team-makeup-head-money team-makeup-head-money--paid-col">
            Paid
          </div>
        </div>
        {teamMakeupRows.map((row) => {
          const paidClass =
            row.price == null
              ? "dim"
              : row.target == null
                ? "dim"
                : row.price <= row.target
                  ? "green"
                  : "red";
          return (
            <div
              key={row.key}
              className={
                "team-makeup-slot-row" +
                (row.filled
                  ? " team-makeup-slot-row--filled"
                  : " team-makeup-slot-row--empty")
              }
            >
              <PosBadge pos={row.slot} />
              <div className="team-makeup-slot-player" title={row.playerName}>
                {row.playerName}
              </div>
              <div
                className="team-makeup-slot-money team-makeup-slot-money--target"
                title="Per-slot target $ (same as My Draft Position Allocation → Per Slot)"
              >
                {fmtPerSlotTarget(row.target)}
              </div>
              <div
                className={`team-makeup-slot-money team-makeup-slot-money--paid ${paidClass}`}
                title="Winning bid for this slot"
              >
                {fmtDollar(row.price)}
              </div>
            </div>
          );
        })}
        {teamMakeupRows.length === 0 && <div className="dim">No slots available.</div>}
      </div>
    </section>
  );
}

function LeftPanel({
  league,
  selectedPlayerPositions,
  allPlayers,
  draftedIds,
  rosterEntries,
  onRemovePick,
  onUpdatePick,
  engineMarket,
  myTeamEntries,
  savedPositionTargets,
}: {
  league: League | null;
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
  myTeamEntries: RosterEntry[];
  savedPositionTargets: Record<string, number>;
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

  return (
    <div className="cc-left">
      <div className="cc-panel-content cc-panel-content--market-tab cc-panel-content--left-market-only">
          <section className="cc-surface-card cc-surface-card--left">
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
            {posMarket?.supply?.length ? (
              <>
                <div className="cc-divider" />
                <div className="market-section-label">POSITION TIERS</div>
                <div className="msr-tier-list">
                  {posMarket.supply.map((tierRow) => (
                    <div
                      key={`tier-${tierRow.tier}`}
                      className="market-stat-row msr-tier-row"
                      title="Remaining undrafted players in this tier"
                    >
                      <span className="msr-label msr-tier-label-wrap">
                        <span className={`msr-tier-chip msr-tier-chip--${tierRow.tier}`}>
                          {tierRow.tier}
                        </span>
                        Tier {tierRow.tier}
                      </span>
                      <span className="msr-value">
                        {tierRow.count}
                        {tierRow.avgVal != null ? ` · $${tierRow.avgVal}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="msr-tier-legend">
                  <span>Count = undrafted players remaining in tier.</span>
                  <span>Dollar value = avg Draftroom $ for that tier.</span>
                </div>
              </>
            ) : null}
          </section>

          <TeamMakeupSection
            league={league}
            myTeamEntries={myTeamEntries}
            rosterEntries={rosterEntries}
            savedPositionTargets={savedPositionTargets}
            sectionClassName="cc-surface-card cc-surface-card--left cc-team-makeup-card"
            headingClassName="market-section-label"
          />
      </div>
    </div>
  );
}

function enginePlayersKpiCopy(
  playersRemaining: number,
  valuationsLen: number,
  leagueWideSlots: number | null,
): { label: string; title: string } {
  if (
    leagueWideSlots != null &&
    valuationsLen > 0 &&
    playersRemaining === valuationsLen
  ) {
    return {
      label: "Player pool",
      title:
        "Count matches the valuation rows returned for this request (engine player subset), not full league roster slots.",
    };
  }
  if (
    leagueWideSlots != null &&
    Math.abs(playersRemaining - leagueWideSlots) <= 2
  ) {
    return {
      label: "Slots remaining",
      title:
        "Auction roster spots still empty across all teams (from your league template and draft board).",
    };
  }
  return {
    label: "Player pool",
    title:
      "From the valuation engine; may differ from roster template when the engine uses a player subset or another market-depth definition.",
  };
}

function RightPanel({
  league,
  teamData,
  myTeamName,
  rosterEntries,
  engineMarket,
  selectedPlayer,
  selectedPlayerPositions,
  allPlayers,
  onRemovePick,
  onUpdatePick,
}: {
  league: League | null;
  teamData: TeamSummary[];
  myTeamName: string;
  rosterEntries: RosterEntry[];
  engineMarket: ValuationResponse | null;
  selectedPlayer: Player | null;
  selectedPlayerPositions: string[];
  allPlayers: Player[];
  onRemovePick: (id: string) => void;
  onUpdatePick: (
    id: string,
    data: { price?: number; rosterSlot?: string; teamId?: string },
  ) => void;
}) {
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

  const [rightRosterPane, setRightRosterPane] = useState<
    "liquidity" | "standings"
  >("liquidity");

  const playerMap = useMemo(
    () => new Map(allPlayers.map((p) => [p.id, p])),
    [allPlayers],
  );

  const FALLBACK_CATS = useMemo(
    () =>
      [
        { name: "HR", type: "batting" as const },
        { name: "RBI", type: "batting" as const },
        { name: "SB", type: "batting" as const },
        { name: "AVG", type: "batting" as const },
        { name: "W", type: "pitching" as const },
        { name: "SV", type: "pitching" as const },
        { name: "ERA", type: "pitching" as const },
        { name: "WHIP", type: "pitching" as const },
      ] as const,
    [],
  );

  const scoringCats = useMemo(
    () =>
      (league?.scoringCategories?.length
        ? league.scoringCategories
        : FALLBACK_CATS
      ).map((c) => ({ ...c, name: normalizeCatName(c.name) })),
    [league?.scoringCategories, FALLBACK_CATS],
  );

  const [sortCat, setSortCat] = useState<string>("HR");
  const [sortAsc, setSortAsc] = useState(false);

  const projectedStandings = useMemo(
    () =>
      buildProjectedStandings(
        league?.teamNames ?? [],
        rosterEntries,
        playerMap,
        scoringCats,
      ),
    [league?.teamNames, rosterEntries, playerMap, scoringCats],
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

  const toggleStandingsSort = (cat: string) => {
    if (cat === sortCat) setSortAsc((v) => !v);
    else {
      setSortCat(cat);
      setSortAsc(false);
    }
  };

  const my = teamData.find((t) => t.name === myTeamName);
  const teamOneName = (league?.teamNames?.[0] ?? "").trim();
  const isTeamOne = (name: string) =>
    teamOneName !== "" && name.trim() === teamOneName;
  const inflationFactor =
    engineMarket?.context_v2?.market_summary.inflation_factor ??
    engineMarket?.inflation_factor;
  const inflationPct =
    engineMarket?.context_v2?.market_summary.inflation_percent_vs_neutral ??
    (inflationFactor != null ? Math.round((inflationFactor - 1) * 100) : null);
  const leagueWideSpotsLeft =
    league != null
      ? leagueWideAuctionSlotsRemaining(league, rosterEntries)
      : null;
  const enginePlayersKpi = engineMarket
    ? enginePlayersKpiCopy(
        engineMarket.players_remaining,
        engineMarket.valuations?.length ?? 0,
        leagueWideSpotsLeft,
      )
    : null;
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
  const selectedNormId = selectedPlayer?.id ? String(selectedPlayer.id).trim() : "";
  const selectedValuationRow =
    selectedNormId && engineMarket
      ? engineMarket.valuations.find(
          (v) => String(v.player_id).trim() === selectedNormId,
        )
      : undefined;
  const selectedCeiling =
    (selectedValuationRow?.baseline_value != null &&
    Number.isFinite(selectedValuationRow.baseline_value)
      ? selectedValuationRow.baseline_value
      : selectedPlayer?.baseline_value != null &&
          Number.isFinite(selectedPlayer.baseline_value)
        ? selectedPlayer.baseline_value
        : undefined);
  const maxBid = my?.maxBid;
  const budgetLeft = my?.remaining;
  const dollarsPerSpot = my?.ppSpot;

  return (
    <div className="cc-right">
      <section className="cc-surface-card cc-surface-card--right">
        <div className="rp-section-label">BID CONTEXT</div>
        <div className="rp-bid-context-grid">
          <div className="budget-card budget-card--row">
            <div className="bc-label">Ceiling</div>
            <div className="bc-val">
              {selectedCeiling != null ? `$${Math.round(selectedCeiling)}` : "—"}
            </div>
          </div>
          <div className="budget-card budget-card--row">
            <div className="bc-label">Max Bid</div>
            <div className="bc-val">{maxBid != null ? `$${maxBid}` : "—"}</div>
          </div>
          <div className="budget-card budget-card--row">
            <div className="bc-label">Budget Left</div>
            <div className="bc-val">{budgetLeft != null ? `$${budgetLeft}` : "—"}</div>
          </div>
          <div className="budget-card budget-card--row">
            <div className="bc-label">$/Spot</div>
            <div className="bc-val">{dollarsPerSpot != null ? `$${dollarsPerSpot}` : "—"}</div>
          </div>
        </div>
      </section>

      <section className="cc-surface-card cc-surface-card--right">
        <div className="rp-section-label">MARKET PRESSURE</div>
        {engineMarket ? (
          <div className={`engine-market-card ${marketClass}`}>
            <div className="engine-market-main">
              <div
                className="engine-market-kpi"
                title={
                  inflationPct != null
                    ? `Vs neutral: ${inflationPct >= 0 ? "+" : ""}${inflationPct}%`
                    : undefined
                }
              >
                <div className="em-label em-label--inflation">
                  Inflation Index
                </div>
                <div className="em-value em-value--inflation">
                  {inflationFactor != null ? `${inflationFactor.toFixed(2)}x` : "—"}
                </div>
              </div>
              <div className="engine-market-kpi">
                <div className="em-label">Budget Left</div>
                <div className="em-value">${engineMarket.total_budget_remaining}</div>
              </div>
              <div className="engine-market-kpi">
                <div className="em-label" title={enginePlayersKpi?.title}>
                  {enginePlayersKpi?.label === "Slots remaining"
                    ? "Open Slots"
                    : "Players Remaining"}
                </div>
                <div className="em-value">{engineMarket.players_remaining}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="engine-market-empty">Engine market snapshot unavailable.</div>
        )}
      </section>

      <section className="cc-surface-card cc-surface-card--right cc-right-roster-pane">
        <div
          className="rp-roster-toggle"
          role="tablist"
          aria-label="Team liquidity or projected standings"
        >
          <button
            type="button"
            role="tab"
            aria-selected={rightRosterPane === "liquidity"}
            className={
              "rp-roster-toggle-btn " +
              (rightRosterPane === "liquidity"
                ? "rp-roster-toggle-btn--active"
                : "")
            }
            onClick={() => setRightRosterPane("liquidity")}
          >
            Liquidity
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightRosterPane === "standings"}
            className={
              "rp-roster-toggle-btn " +
              (rightRosterPane === "standings"
                ? "rp-roster-toggle-btn--active"
                : "")
            }
            onClick={() => setRightRosterPane("standings")}
          >
            Standings
          </button>
        </div>

        {rightRosterPane === "liquidity" ? (
          <>
            <div className="rp-section-label">TEAM LIQUIDITY</div>
            <div className="liquidity-table-wrap">
              <table className="liquidity-table">
                <thead>
                  <tr>
                    {(
                      [
                        ["name", "TEAM"],
                        ["remaining", "LEFT"],
                        ["open", "OPEN"],
                        ["maxBid", "MAX"],
                        ["ppSpot", "$/SP"],
                      ] as [LiqCol, string][]
                    ).map(([col, label]) => (
                      <th
                        key={col}
                        className="liq-th-sortable"
                        onClick={() => toggleLiqSort(col)}
                      >
                        <span className="liq-th-inner">
                          <span className="liq-th-label">{label}</span>
                          {liqSort.col === col ? (
                            <span className="th-sort-icon th-sort-active">
                              {liqSort.dir === "asc" ? "▲" : "▼"}
                            </span>
                          ) : (
                            <span className="th-sort-icon th-sort-idle">↕</span>
                          )}
                        </span>
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
                            isTeamOne(t.name) ? "cc-team-one-row" : "",
                            ineligible ? "liq-ineligible" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
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
          </>
        ) : (
          <>
            <div className="rp-section-label">PROJECTED STANDINGS</div>
            <div className="liquidity-table-wrap lo-standings-wrap--right">
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
                          onClick={() => toggleStandingsSort(c.name)}
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
                        className={[
                          idx % 2 === 0 ? "lo-tr-even" : "",
                          isTeamOne(row.teamName) ? "cc-team-one-row" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
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
          </>
        )}
      </section>

      <section className="cc-surface-card cc-surface-card--right cc-right-draft-log">
        <DraftLog
          rosterEntries={rosterEntries}
          league={league}
          allPlayers={allPlayers}
          onRemovePick={onRemovePick}
          onUpdatePick={onUpdatePick}
        />
      </section>
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
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);
  // const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [mlbPlayers, setMlbPlayers] = useState<Player[]>([]);
  const { selectedPlayer, setSelectedPlayer } = useSelectedPlayer();
  const { customPlayers, addCustomPlayer } = useCustomPlayers();
  const [showAddModal, setShowAddModal] = useState(false);
  const [engineMarket, setEngineMarket] = useState<ValuationResponse | null>(
    null,
  );
  const savedPositionTargets = useMemo(
    () => readPositionTargetsFromStorage(leagueId),
    [leagueId],
  );

  const allPlayers = useMemo(
    () => [...customPlayers, ...mlbPlayers],
    [customPlayers, mlbPlayers],
  );

  const rosterValuationKey = useMemo(
    () => rosterValuationFingerprint(rosterEntries),
    [rosterEntries],
  );

  const leagueValuationKey = useMemo(
    () => leagueValuationConfigKey(league ?? null),
    [
      league?.id,
      league?.teams,
      league?.budget,
      league ? JSON.stringify(league.rosterSlots) : "",
      league ? JSON.stringify(league.scoringCategories) : "",
      league?.memberIds?.join(","),
      league?.posEligibilityThreshold,
      league?.playerPool,
      league?.teamNames?.join("\u0001"),
    ],
  );

  const userTeamIdForValuation = useMemo(
    () => resolveUserTeamId(league ?? null, user?.id),
    [league?.id, league?.memberIds?.join(","), user?.id],
  );

  /** DEV only: focus board-valuation logs on the selected Draftroom player. */
  const valuationBoardLogPlayerId =
    import.meta.env.DEV ? selectedPlayer?.id : undefined;

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
    void getValuation(
      leagueId,
      token,
      userTeamIdForValuation,
      valuationBoardLogPlayerId ?? null,
    )
      .then((res) => {
        if (!cancelled) setEngineMarket(res);
      })
      .catch(() => {
        if (!cancelled) setEngineMarket(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    leagueId,
    token,
    userTeamIdForValuation,
    rosterValuationKey,
    leagueValuationKey,
    valuationBoardLogPlayerId,
  ]);

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
          league={league}
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
          myTeamEntries={myTeamEntries}
          savedPositionTargets={savedPositionTargets}
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
          engineMarket={engineMarket}
        />
        <RightPanel
          league={league}
          teamData={teamData}
          myTeamName={myTeamName}
          rosterEntries={rosterEntries}
          engineMarket={engineMarket}
          selectedPlayer={selectedPlayer}
          selectedPlayerPositions={
            selectedPlayer
              ? selectedPlayer.positions?.length
                ? selectedPlayer.positions
                : [selectedPlayer.position]
              : []
          }
          allPlayers={allPlayers}
          onRemovePick={handleRemovePick}
          onUpdatePick={handleUpdatePick}
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
