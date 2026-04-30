import { useEffect, useMemo, useState } from "react";
import type { League } from "../../contexts/LeagueContext";
import type { Player } from "../../types/player";
import type { RosterEntry } from "../../api/roster";
import type { ValuationResponse } from "../../api/engine";
import PosBadge from "../PosBadge";
import { computePositionMarket } from "../../pages/commandCenterUtils";
import { CommandCenterMyTeamStandingsSection } from "./CommandCenterMyTeamStandingsSection";
import { CommandCenterTeamMakeupSection } from "./CommandCenterTeamMakeupSection";

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
                    "market-pos-tab " + (pos === activeMarketPosition ? "active" : "")
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
              {posMarket && posMarket.avgWinPrice > 0 ? `$${posMarket.avgWinPrice}` : "—"}
            </span>
          </div>
          <div
            className="market-stat-row"
            title="Draftroom catalog list $ mean for undrafted players at this position"
          >
            <span className="msr-label">DRAFTROOM AVG $</span>
            <span className="msr-value green">
              {posMarket && posMarket.avgProjValue > 0 ? `$${posMarket.avgProjValue}` : "—"}
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
                        <span className={`msr-tier-chip msr-tier-chip--${tier}`} title={`Tier ${tier}`}>
                          {tier}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {([1, 2, 3, 4, 5] as const).map((tier) => {
                      const tierRow = posMarket.supply.find((r) => r.tier === tier);
                      const count = tierRow?.count ?? 0;
                      const avgVal = tierRow?.avgVal;
                      return (
                        <td key={tier}>
                          <div className="msr-tier-cell-stack">
                            <span className="msr-tier-cell-rem" title="Undrafted players remaining in this tier">
                              {count}
                            </span>
                            <span className="msr-tier-cell-avg" title="Average Draftroom $ for players in this tier">
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
