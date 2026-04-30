import { useState, useEffect, useMemo } from "react";
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
import { AuctionCenter } from "../components/AuctionCenter";
import PosBadge from "../components/PosBadge";
import { CommandCenterDraftLog } from "../components/command-center/CommandCenterDraftLog";
import { CommandCenterMyTeamStandingsSection } from "../components/command-center/CommandCenterMyTeamStandingsSection";
import { CommandCenterRightLiquidityTable } from "../components/command-center/CommandCenterRightLiquidityTable";
import { CommandCenterRightStandingsTable } from "../components/command-center/CommandCenterRightStandingsTable";
import { CommandCenterTeamMakeupSection } from "../components/command-center/CommandCenterTeamMakeupSection";
import {
  type TeamSummary,
  computeTeamData,
  computePositionMarket,
  LOWER_IS_BETTER_CATS,
  leagueWideAuctionSlotsRemaining,
} from "./commandCenterUtils";
import {
  buildInflationKpi,
  enginePlayersKpiCopy,
} from "./commandCenterMarket";
import { useProjectedStandings } from "./useProjectedStandings";
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

/** Default 5×5-style cats when league has no custom scoring list (same as right-rail standings). */
const COMMAND_CENTER_FALLBACK_SCORING_CATS: {
  name: string;
  type: "batting" | "pitching";
}[] = [
  { name: "HR", type: "batting" },
  { name: "RBI", type: "batting" },
  { name: "SB", type: "batting" },
  { name: "AVG", type: "batting" },
  { name: "W", type: "pitching" },
  { name: "SV", type: "pitching" },
  { name: "ERA", type: "pitching" },
  { name: "WHIP", type: "pitching" },
];

function LeftPanel({
  league,
  selectedPlayerPositions,
  allPlayers,
  draftedIds,
  rosterEntries,
  engineMarket,
  savedPositionTargets,
  myTeamName,
  myTeamId,
}: {
  league: League | null;
  selectedPlayerPositions: string[];
  allPlayers: Player[];
  draftedIds: Set<string>;
  rosterEntries: RosterEntry[];
  engineMarket?: ValuationResponse | null;
  savedPositionTargets: Record<string, number>;
  myTeamName: string;
  myTeamId: string | null;
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
            {posMarket?.supply?.length ? (
              <>
                <div className="cc-divider" />
                <div className="msr-tier-header-row">
                  <span className="market-section-label msr-tier-section-label">
                    POSITION TIERS
                  </span>
                  <span
                    className="msr-tier-legend"
                    title="Per tier: undrafted count at this position, then average Draftroom catalog $"
                  >
                    Remaining / Avg $
                  </span>
                </div>
                <table className="msr-tier-table msr-tier-table--5col">
                  <thead>
                    <tr>
                      {([1, 2, 3, 4, 5] as const).map((tier) => (
                        <th key={tier} scope="col">
                          <span
                            className={`msr-tier-chip msr-tier-chip--${tier}`}
                            title={`Tier ${tier}`}
                          >
                            {tier}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {([1, 2, 3, 4, 5] as const).map((tier) => {
                        const tierRow = posMarket.supply.find(
                          (r) => r.tier === tier,
                        );
                        const count = tierRow?.count ?? 0;
                        const avgVal = tierRow?.avgVal;
                        return (
                          <td key={tier}>
                            <div className="msr-tier-cell-stack">
                              <span
                                className="msr-tier-cell-rem"
                                title="Undrafted players remaining in this tier"
                              >
                                {count}
                              </span>
                              <span
                                className="msr-tier-cell-avg"
                                title="Average Draftroom $ for players in this tier"
                              >
                                {avgVal != null ? `$${avgVal}` : "—"}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </>
            ) : null}
          </section>

          <CommandCenterMyTeamStandingsSection
            league={league}
            rosterEntries={rosterEntries}
            allPlayers={allPlayers}
            myTeamName={myTeamName}
            fallbackScoringCategories={COMMAND_CENTER_FALLBACK_SCORING_CATS}
          />

          <CommandCenterTeamMakeupSection
            league={league}
            rosterEntries={rosterEntries}
            savedPositionTargets={savedPositionTargets}
            myTeamId={myTeamId}
            sectionClassName="cc-surface-card cc-surface-card--left cc-team-makeup-card"
          />
      </div>
    </div>
  );
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
  const [rightRosterPane, setRightRosterPane] = useState<
    "liquidity" | "standings"
  >("liquidity");

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

  const { scoringCats, projectedStandings, rankMaps } = useProjectedStandings({
    leagueTeamNames: league?.teamNames,
    leagueScoringCategories: league?.scoringCategories,
    fallbackScoringCategories: COMMAND_CENTER_FALLBACK_SCORING_CATS,
    rosterEntries,
    allPlayers,
  });

  const [sortCat, setSortCat] = useState<string>("HR");
  const [sortAsc, setSortAsc] = useState(false);

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
  const inflationKpi = buildInflationKpi(engineMarket, import.meta.env.DEV);

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
    inflationKpi.marketClass;
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
                title={inflationKpi.title}
              >
                <div className="em-label em-label--inflation">
                  Inflation Index
                </div>
                <div className="em-value em-value--inflation">
                  {inflationKpi.gaugeValue != null
                    ? `${inflationKpi.gaugeValue.toFixed(2)}×`
                    : inflationKpi.isReplacementSlotsV2
                      ? "N/A"
                      : "—"}
                </div>
              </div>
              <div className="engine-market-kpi">
                <div className="em-label">Budget Left</div>
                <div className="em-value">${engineMarket.total_budget_remaining}</div>
              </div>
              <div className="engine-market-kpi">
                <div className="em-label" title={enginePlayersKpi?.title}>
                  {enginePlayersKpi?.label ?? "Players Remaining"}
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
        <div className="pac-snapshot-header cc-roster-pane-head" role="presentation">
          <span className="market-section-label">
            {rightRosterPane === "liquidity" ? "LIQUIDITY" : "STANDINGS"}
          </span>
          <div
            className="stat-view-toggle"
            role="tablist"
            aria-label="Team liquidity or standings"
          >
            <button
              type="button"
              role="tab"
              aria-selected={rightRosterPane === "liquidity"}
              className={
                "svt-btn " + (rightRosterPane === "liquidity" ? "active" : "")
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
                "svt-btn " + (rightRosterPane === "standings" ? "active" : "")
              }
              onClick={() => setRightRosterPane("standings")}
            >
              Standings
            </button>
          </div>
        </div>
        {rightRosterPane === "liquidity" ? (
          <>
            <CommandCenterRightLiquidityTable
              sortedTeamData={sortedTeamData}
              liqSort={liqSort}
              onToggleLiqSort={toggleLiqSort}
              selectedPlayerPositions={selectedPlayerPositions}
              league={league}
              rosterEntries={rosterEntries}
              myTeamName={myTeamName}
              isTeamOne={isTeamOne}
            />
          </>
        ) : (
          <>
            <CommandCenterRightStandingsTable
              scoringCats={scoringCats}
              sortedProjStandings={sortedProjStandings}
              rankMaps={rankMaps}
              sortCat={sortCat}
              sortAsc={sortAsc}
              onToggleStandingsSort={toggleStandingsSort}
              isTeamOne={isTeamOne}
            />
          </>
        )}
      </section>

      <section className="cc-surface-card cc-surface-card--right cc-right-draft-log">
        <CommandCenterDraftLog
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
  const selectedPlayerPositions = useMemo(
    () =>
      selectedPlayer
        ? selectedPlayer.positions?.length
          ? selectedPlayer.positions
          : [selectedPlayer.position]
        : [],
    [selectedPlayer],
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

  return (
    <div className="cc-page">
      <div className="cc-layout">
        <LeftPanel
          league={league}
          myTeamName={myTeamName}
          myTeamId={myTeamId}
          selectedPlayerPositions={selectedPlayerPositions}
          allPlayers={allPlayers}
          draftedIds={draftedIds}
          rosterEntries={rosterEntries}
          engineMarket={engineMarket}
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
          selectedPlayerPositions={selectedPlayerPositions}
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
