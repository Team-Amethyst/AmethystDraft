import type { Player } from "../../types/player";
import type { RosterEntry } from "../../api/roster";
import { getEffectiveTierValue, type TierValueOverride } from "../../utils/effectiveTierValue";
import { normalizeCatName } from "./categories";

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
  position: string | null,
  allPlayers: Player[],
  draftedIds: Set<string>,
  rosterEntries: RosterEntry[],
  tierValueOverrides?: ReadonlyMap<string, TierValueOverride>,
): PositionMarket | null {
  if (!position || allPlayers.length === 0) return null;

  const posPlayers = allPlayers.filter(
    (p) => p.position === position || p.positions?.includes(position),
  );
  const draftedAtPos = posPlayers.filter((p) => draftedIds.has(p.id));
  const remaining = posPlayers.filter((p) => !draftedIds.has(p.id));
  const draftedEntries = rosterEntries.filter((e) =>
    draftedAtPos.some((p) => p.id === e.externalPlayerId),
  );

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
              { tier: p.tier, value: p.value },
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

  const allTiers = [
    ...new Set(
      remaining.map(
        (p) =>
          getEffectiveTierValue(
            p.id,
            { tier: p.tier, value: p.value },
            tierValueOverrides,
          ).tier,
      ),
    ),
  ].sort((a, b) => a - b);
  const avgOrNull = (arr: Player[]) =>
    arr.length
      ? Math.round(
          arr.reduce(
            (s, p) =>
              s +
              getEffectiveTierValue(
                p.id,
                { tier: p.tier, value: p.value },
                tierValueOverrides,
              ).value,
            0,
          ) / arr.length,
        )
      : null;

  return {
    position,
    avgWinPrice,
    avgProjValue,
    inflation,
    supply: allTiers.map((tier) => {
      const arr = remaining.filter(
        (p) =>
          getEffectiveTierValue(
            p.id,
            { tier: p.tier, value: p.value },
            tierValueOverrides,
          ).tier === tier,
      );
      return { tier, count: arr.length, avgVal: avgOrNull(arr) };
    }),
  };
}
