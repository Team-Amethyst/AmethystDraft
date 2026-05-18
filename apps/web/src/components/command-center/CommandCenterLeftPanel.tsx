import { useEffect, useMemo, useState } from "react";
import type { League } from "../../contexts/LeagueContext";
import type { Player } from "../../types/player";
import type { RosterEntry } from "../../api/roster";
import type { ValuationResponse } from "../../api/engine";
import { computePositionMarket } from "../../pages/commandCenterUtils";
import { rosterSlotsToRecord } from "../../pages/command-center-utils/roster";
import { commandCenterMarketSlotsForPlayer } from "../../utils/eligibility";
import { CommandCenterMyTeamStandingsSection } from "./CommandCenterMyTeamStandingsSection";
import { CommandCenterTeamMakeupSection } from "./CommandCenterTeamMakeupSection";
import { CommandCenterLeftMarketCard } from "./CommandCenterLeftMarketCard";

type ScoringCategory = {
  name: string;
  type: "batting" | "pitching";
};

export function CommandCenterLeftPanel({
  league,
  selectedPlayer,
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
  selectedPlayer: Player | null;
  allPlayers: Player[];
  draftedIds: Set<string>;
  rosterEntries: RosterEntry[];
  engineMarket?: ValuationResponse | null;
  savedPositionTargets: Record<string, number>;
  myTeamName: string;
  myTeamId: string | null;
  fallbackScoringCategories: ScoringCategory[];
}) {
  const rosterSlotKeys = useMemo(
    () => Object.keys(rosterSlotsToRecord(league?.rosterSlots)),
    [league?.rosterSlots],
  );

  const eligibleMarketSlots = useMemo(() => {
    if (!selectedPlayer || rosterSlotKeys.length === 0) return [];
    return commandCenterMarketSlotsForPlayer(selectedPlayer, rosterSlotKeys);
  }, [selectedPlayer, rosterSlotKeys]);

  const [activeMarketSlot, setActiveMarketSlot] = useState<string | null>(
    eligibleMarketSlots[0] ?? null,
  );

  useEffect(() => {
    if (eligibleMarketSlots.length === 0) {
      setActiveMarketSlot(null);
      return;
    }
    setActiveMarketSlot((prev) =>
      prev && eligibleMarketSlots.includes(prev)
        ? prev
        : eligibleMarketSlots[0],
    );
  }, [eligibleMarketSlots]);

  const posMarket = useMemo(() => {
    const engineTierValueMap =
      engineMarket != null
        ? new Map(
            engineMarket.valuations
              .filter(
                (v) =>
                  v.auction_value != null && Number.isFinite(v.auction_value),
              )
              .map((v) => [
                v.player_id,
                { tier: v.tier, value: v.auction_value as number },
              ]),
          )
        : undefined;
    return computePositionMarket(
      activeMarketSlot,
      allPlayers,
      draftedIds,
      rosterEntries,
      engineTierValueMap,
    );
  }, [activeMarketSlot, allPlayers, draftedIds, rosterEntries, engineMarket]);

  return (
    <div className="cc-left">
      <div className="cc-panel-content cc-panel-content--market-tab cc-panel-content--left-market-only">
        <CommandCenterLeftMarketCard
          posMarket={posMarket}
          eligibleMarketSlots={eligibleMarketSlots}
          activeMarketSlot={activeMarketSlot}
          onSelectMarketSlot={setActiveMarketSlot}
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
