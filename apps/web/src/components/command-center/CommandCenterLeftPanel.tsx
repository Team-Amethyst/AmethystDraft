import { useEffect, useMemo, useState } from "react";
import type { League } from "../../contexts/LeagueContext";
import type { Player } from "../../types/player";
import type { RosterEntry } from "../../api/roster";
import type { ValuationResponse } from "../../api/engine";
import { computePositionMarket } from "../../pages/commandCenterUtils";
import { CommandCenterMyTeamStandingsSection } from "./CommandCenterMyTeamStandingsSection";
import { CommandCenterTeamMakeupSection } from "./CommandCenterTeamMakeupSection";
import { CommandCenterLeftMarketCard } from "./CommandCenterLeftMarketCard";

type ScoringCategory = {
  name: string;
  type: "batting" | "pitching";
};

export function CommandCenterLeftPanel({
  league,
  selectedPlayerPositions,
  allPlayers,
  draftedIds,
  rosterEntries,
  engineMarket,
  savedPositionTargets,
  myTeamName,
  myTeamId,
  fallbackScoringCategories,
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
  fallbackScoringCategories: ScoringCategory[];
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

  const posMarket = useMemo(() => {
    const engineTierValueMap =
      engineMarket != null
        ? new Map(
            engineMarket.valuations.map((v) => [
              v.player_id,
              { tier: v.tier, value: v.adjusted_value },
            ]),
          )
        : undefined;
    return computePositionMarket(
      activeMarketPosition,
      allPlayers,
      draftedIds,
      rosterEntries,
      engineTierValueMap,
    );
  }, [activeMarketPosition, allPlayers, draftedIds, rosterEntries, engineMarket]);

  return (
    <div className="cc-left">
      <div className="cc-panel-content cc-panel-content--market-tab cc-panel-content--left-market-only">
        <CommandCenterLeftMarketCard
          posMarket={posMarket}
          eligibleMarketPositions={eligibleMarketPositions}
          activeMarketPosition={activeMarketPosition}
          onSelectMarketPosition={setActiveMarketPosition}
        />

        <CommandCenterMyTeamStandingsSection
          league={league}
          rosterEntries={rosterEntries}
          allPlayers={allPlayers}
          myTeamName={myTeamName}
          fallbackScoringCategories={fallbackScoringCategories}
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
