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
import { CommandCenterRightBidContextCard } from "./CommandCenterRightBidContextCard";
import { CommandCenterRightMarketPressureCard } from "./CommandCenterRightMarketPressureCard";
import { CommandCenterRightRosterPane } from "./CommandCenterRightRosterPane";

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
    data: {
      price?: number;
      rosterSlot?: string;
      teamId?: string;
      keeperContract?: string;
    },
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
      <CommandCenterRightBidContextCard
        selectedCeiling={selectedCeiling}
        maxBid={maxBid}
        budgetLeft={budgetLeft}
        dollarsPerSpot={dollarsPerSpot}
      />

      <CommandCenterRightMarketPressureCard
        engineMarket={engineMarket}
        marketClass={marketClass}
        inflationTitle={inflationKpi.title}
        inflationGaugeValue={inflationKpi.gaugeValue}
        isReplacementSlotsV2={inflationKpi.isReplacementSlotsV2}
        enginePlayersKpiLabel={enginePlayersKpi?.label}
        enginePlayersKpiTitle={enginePlayersKpi?.title}
      />

      <CommandCenterRightRosterPane
        rightRosterPane={rightRosterPane}
        onSetRightRosterPane={setRightRosterPane}
        sortedTeamData={sortedTeamData}
        liqSort={liqSort}
        onToggleLiqSort={toggleLiqSort}
        selectedPlayerPositions={selectedPlayerPositions}
        league={league}
        rosterEntries={rosterEntries}
        myTeamName={myTeamName}
        isTeamOne={isTeamOne}
        scoringCats={scoringCats}
        sortedProjStandings={sortedProjStandings}
        rankMaps={rankMaps}
        sortCat={sortCat}
        sortAsc={sortAsc}
        onToggleStandingsSort={toggleStandingsSort}
      />

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
