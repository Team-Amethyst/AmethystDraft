import type { Player } from "../../types/player";
import {
  resolveDisplayTierConfig,
  userFacingDisplayTierForMarketPlayer,
} from "../../domain/displayTiers";
import type { RosterEntry } from "../../api/roster";
import { getEffectiveTierValue, type TierValueOverride } from "../../utils/effectiveTierValue";
import { slotAllowsPosition } from "../../utils/eligibility";
import { normalizeCatName } from "./categories";

const PITCHER_ROSTER_SLOTS = new Set(["SP", "RP", "P"]);

function normalizeSlotKey(slot: string): string {
  return slot.toUpperCase().replace(/\s+/g, "");
}

/** True when a logged pick’s roster slot belongs under this market tab (P absorbs SP/RP). */
export function rosterSlotMatchesMarketTab(
  marketSlot: string,
  entryRosterSlot: string | undefined | null,
): boolean {
  const market = normalizeSlotKey(marketSlot);
  const entry = normalizeSlotKey(entryRosterSlot ?? "");
  if (!entry) return false;
  if (market === entry) return true;
  if (market === "P" && PITCHER_ROSTER_SLOTS.has(entry)) return true;
  return false;
}

export function playerEligibleForMarketSlot(
  player: Pick<Player, "position" | "positions">,
  marketSlot: string,
): boolean {
  const positions = player.positions?.length
    ? player.positions
    : [player.position];
  return positions.some((pos) => slotAllowsPosition(marketSlot, pos));
}

export interface PositionMarket {
  position: string;
  avgWinPrice: number;
  avgProjValue: number;
  inflation: number;
  supply: Array<{ tier: number; count: number; avgVal: number | null }>;
}

export function getStatByCategory(
  player: Player,
  catName: string,
  catType: "batting" | "pitching",
): number {
  const name = normalizeCatName(catName).trim().toUpperCase();
  if (catType === "batting") {
    const b = player.stats?.batting;
    if (!b) return 0;
    if (name === "HR") return b.hr;
    if (name === "RBI") return b.rbi;
    if (name === "R" || name === "RUNS") return b.runs;
    if (name === "SB") return b.sb;
    if (name === "AVG") return parseFloat(b.avg) || 0;
    if (name === "OBP") return parseFloat(b.obp) || 0;
    if (name === "SLG") return parseFloat(b.slg) || 0;
    return 0;
  }
  const p = player.stats?.pitching;
  if (!p) return 0;
  if (name === "W" || name === "WINS") return p.wins;
  if (name === "K" || name === "SO") return p.strikeouts;
  if (name === "ERA") return parseFloat(p.era) || 0;
  if (
    name === "WHIP" ||
    name === "WALKS + HITS PER IP" ||
    name === "W+H/IP" ||
    (name.includes("WHIP") && name.includes("IP"))
  )
    return parseFloat(p.whip) || 0;
  if (name === "SV" || name === "SAVES") return p.saves;
  if (name === "IP") return parseFloat(p.innings) || 0;
  return 0;
}

export function computePositionMarket(
  marketSlot: string | null,
  allPlayers: Player[],
  draftedIds: Set<string>,
  rosterEntries: RosterEntry[],
  tierValueOverrides?: ReadonlyMap<string, TierValueOverride>,
  leagueBudget?: number,
): PositionMarket | null {
  const tierBands = resolveDisplayTierConfig(leagueBudget).bands;
  if (!marketSlot || allPlayers.length === 0) return null;

  const engineAuctionValueByPlayerId = tierValueOverrides
    ? new Map(
        [...tierValueOverrides.entries()]
          .filter(([, o]) => Number.isFinite(o.value))
          .map(([id, o]) => [id, o.value]),
      )
    : undefined;
  const marketTierOpts = {
    leagueBudget,
    engineAuctionValueByPlayerId,
  };

  const posPlayers = allPlayers.filter((p) =>
    playerEligibleForMarketSlot(p, marketSlot),
  );
  const draftedAtPos = posPlayers.filter((p) => draftedIds.has(p.id));
  const remaining = posPlayers.filter((p) => !draftedIds.has(p.id));
  const draftedPlayerIds = new Set(draftedAtPos.map((p) => p.id));
  const draftedEntries = rosterEntries.filter((e) => {
    if (!draftedPlayerIds.has(e.externalPlayerId)) return false;
    if (e.rosterSlot) return rosterSlotMatchesMarketTab(marketSlot, e.rosterSlot);
    const player = posPlayers.find((p) => p.id === e.externalPlayerId);
    return player != null && playerEligibleForMarketSlot(player, marketSlot);
  });

  const avgWinPrice = draftedEntries.length
    ? Math.round(
        draftedEntries.reduce((s, e) => s + e.price, 0) / draftedEntries.length,
      )
    : 0;
  const avgProjValue = remaining.length
    ? Math.round(
        remaining.reduce(
          (s, p) =>
            s +
            getEffectiveTierValue(
              p.id,
              {
                tier:
                  userFacingDisplayTierForMarketPlayer(p, marketTierOpts) ?? 5,
                value: p.value,
              },
              tierValueOverrides,
            ).value,
          0,
        ) / remaining.length,
      )
    : 0;
  const inflation =
    avgWinPrice > 0 && avgProjValue > 0
      ? Math.round((avgWinPrice / avgProjValue - 1) * 100)
      : 0;

  const avgOrNull = (arr: Player[]) =>
    arr.length
      ? Math.round(
          arr.reduce(
            (s, p) =>
              s +
              getEffectiveTierValue(
                p.id,
                {
                  tier:
                    userFacingDisplayTierForMarketPlayer(p, marketTierOpts) ?? 5,
                  value: p.value,
                },
                tierValueOverrides,
              ).value,
            0,
          ) / arr.length,
        )
      : null;

  return {
    position: marketSlot,
    avgWinPrice,
    avgProjValue,
    inflation,
    supply: tierBands.map((band) => {
      const arr = remaining.filter(
        (p) =>
          userFacingDisplayTierForMarketPlayer(p, marketTierOpts) === band.tier,
      );
      return { tier: band.tier, count: arr.length, avgVal: avgOrNull(arr) };
    }),
  };
}
