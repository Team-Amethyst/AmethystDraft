import { useMemo, useState } from "react";
import type { League } from "../../contexts/LeagueContext";
import type { Player } from "../../types/player";
import type { RosterEntry } from "../../api/roster";
import type { ValuationResponse } from "../../api/engine";
import type { TeamSummary } from "../../pages/commandCenterUtils";
import { LOWER_IS_BETTER_CATS, leagueWideAuctionSlotsRemaining } from "../../pages/commandCenterUtils";
import { buildInflationKpi, enginePlayersKpiCopy } from "../../pages/commandCenterMarket";
import { useProjectedStandings } from "../../pages/useProjectedStandings";
import { CommandCenterDraftLog } from "./CommandCenterDraftLog";
import { CommandCenterRightLiquidityTable } from "./CommandCenterRightLiquidityTable";
import { CommandCenterRightStandingsTable } from "./CommandCenterRightStandingsTable";

type ScoringCategory = {
  name: string;
  type: "batting" | "pitching";
};

type LiqCol = "name" | "remaining" | "open" | "maxBid" | "ppSpot";

export function CommandCenterRightPanel({
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
  fallbackScoringCategories,
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
  fallbackScoringCategories: ScoringCategory[];
}) {
  const [rightRosterPane, setRightRosterPane] = useState<"liquidity" | "standings">(
    "liquidity",
  );

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
    fallbackScoringCategories,
    rosterEntries,
    allPlayers,
  });

  const [sortCat, setSortCat] = useState<string>("HR");
  const [sortAsc, setSortAsc] = useState(false);
  const sortedProjStandings = useMemo(() => {
    return [...projectedStandings].sort((a, b) => {
      const diff = (a.stats[sortCat] ?? 0) - (b.stats[sortCat] ?? 0);
      const ranked = LOWER_IS_BETTER_CATS.has(sortCat.toUpperCase()) ? diff : -diff;
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
  const isTeamOne = (name: string) => teamOneName !== "" && name.trim() === teamOneName;
  const inflationKpi = buildInflationKpi(engineMarket, import.meta.env.DEV);

  const leagueWideSpotsLeft = league != null ? leagueWideAuctionSlotsRemaining(league, rosterEntries) : null;
  const enginePlayersKpi = engineMarket
    ? enginePlayersKpiCopy(
        engineMarket.players_remaining,
        engineMarket.valuations?.length ?? 0,
        leagueWideSpotsLeft,
      )
    : null;
  const marketClass = inflationKpi.marketClass;

  const selectedNormId = selectedPlayer?.id ? String(selectedPlayer.id).trim() : "";
  const selectedValuationRow =
    selectedNormId && engineMarket
      ? engineMarket.valuations.find((v) => String(v.player_id).trim() === selectedNormId)
      : undefined;
  const selectedCeiling =
    selectedValuationRow?.baseline_value != null && Number.isFinite(selectedValuationRow.baseline_value)
      ? selectedValuationRow.baseline_value
      : selectedPlayer?.baseline_value != null && Number.isFinite(selectedPlayer.baseline_value)
        ? selectedPlayer.baseline_value
        : undefined;
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
            <div className="bc-val">{selectedCeiling != null ? `$${Math.round(selectedCeiling)}` : "—"}</div>
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
              <div className="engine-market-kpi" title={inflationKpi.title}>
                <div className="em-label em-label--inflation">Inflation Index</div>
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
          <div className="stat-view-toggle" role="tablist" aria-label="Team liquidity or standings">
            <button
              type="button"
              role="tab"
              aria-selected={rightRosterPane === "liquidity"}
              className={"svt-btn " + (rightRosterPane === "liquidity" ? "active" : "")}
              onClick={() => setRightRosterPane("liquidity")}
            >
              Liquidity
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rightRosterPane === "standings"}
              className={"svt-btn " + (rightRosterPane === "standings" ? "active" : "")}
              onClick={() => setRightRosterPane("standings")}
            >
              Standings
            </button>
          </div>
        </div>
        {rightRosterPane === "liquidity" ? (
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
        ) : (
          <CommandCenterRightStandingsTable
            scoringCats={scoringCats}
            sortedProjStandings={sortedProjStandings}
            rankMaps={rankMaps}
            sortCat={sortCat}
            sortAsc={sortAsc}
            onToggleStandingsSort={toggleStandingsSort}
            isTeamOne={isTeamOne}
          />
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
