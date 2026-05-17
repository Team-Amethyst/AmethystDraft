import type { Player } from "../types/player";
import { displayAuctionTier } from "../domain/playerRankTier";
import { countResearchTablePositionParts } from "./eligibility";
import {
  calculateTierStats,
  displayAuctionValue,
  formatCliffToNextTierLabel,
  formatTierBandDisplay,
  groupPlayersByTier,
  isBoardMostlyFlatAfterTopTier,
  isDeemphasizedTier,
  MEANINGFUL_BAND_FLOOR_RAW,
  MEANINGFUL_CLIFF_RAW_THRESHOLD,
  rawTierAuctionValue,
  sortPlayersInTier,
  tierMeaningfulFloorRaw,
  tierPlayersWithAuctionValue,
  tierShelvedCount,
  topPlayerNamesByAuctionValue,
  type TierSortField,
  type TierStats,
} from "./tiers";

export type { TierSortField };

export type ValueBandId =
  | "elite_30"
  | "strong_20"
  | "starter_15"
  | "useful_10"
  | "depth_5"
  | "minbid_2"
  | "reserve_1"
  | "unvalued";

export type ValueBandDef = {
  id: ValueBandId;
  label: string;
  shortRange: string;
  minInclusive: number;
  maxExclusive: number;
};

export const VALUE_BAND_DEFS: readonly ValueBandDef[] = [
  {
    id: "elite_30",
    label: "Elite targets",
    shortRange: "$30+",
    minInclusive: 30,
    maxExclusive: Number.POSITIVE_INFINITY,
  },
  {
    id: "strong_20",
    label: "Strong starters",
    shortRange: "$20–29",
    minInclusive: 20,
    maxExclusive: 30,
  },
  {
    id: "starter_15",
    label: "Starter targets",
    shortRange: "$15–19",
    minInclusive: 15,
    maxExclusive: 20,
  },
  {
    id: "useful_10",
    label: "Useful starters",
    shortRange: "$10–14",
    minInclusive: 10,
    maxExclusive: 15,
  },
  {
    id: "depth_5",
    label: "Depth values",
    shortRange: "$5–9",
    minInclusive: 5,
    maxExclusive: 10,
  },
  {
    id: "minbid_2",
    label: "Min-bid watch",
    shortRange: "$2–4",
    minInclusive: 2,
    maxExclusive: 5,
  },
  {
    id: "reserve_1",
    label: "Replacement / reserve",
    shortRange: "$1",
    minInclusive: 1,
    maxExclusive: 2,
  },
  {
    id: "unvalued",
    label: "No auction value",
    shortRange: "—",
    minInclusive: Number.NEGATIVE_INFINITY,
    maxExclusive: 1,
  },
] as const;

export const VALUE_BAND_ORDER: readonly ValueBandId[] = VALUE_BAND_DEFS.map(
  (d) => d.id,
);

const BAND_BY_ID = new Map<ValueBandId, ValueBandDef>(
  VALUE_BAND_DEFS.map((d) => [d.id, d]),
);

export function valueBandDef(id: ValueBandId): ValueBandDef {
  return BAND_BY_ID.get(id)!;
}

/** Assign a player to a raw-dollar value band (Engine auction dollars when eligible). */
export function valueBandIdForRaw(raw: number | null): ValueBandId {
  if (raw == null || !Number.isFinite(raw)) return "unvalued";
  if (raw >= 30) return "elite_30";
  if (raw >= 20) return "strong_20";
  if (raw >= 15) return "starter_15";
  if (raw >= 10) return "useful_10";
  if (raw >= 5) return "depth_5";
  if (raw >= 2) return "minbid_2";
  if (raw >= 1) return "reserve_1";
  return "unvalued";
}

export function valueBandIdForPlayer(player: Player): ValueBandId {
  return valueBandIdForRaw(rawTierAuctionValue(player));
}

export type ValueBandGroup = { bandId: ValueBandId; players: Player[] };

export function groupPlayersByValueBand(players: Player[]): ValueBandGroup[] {
  const map = new Map<ValueBandId, Player[]>();
  for (const p of players) {
    const id = valueBandIdForPlayer(p);
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(p);
  }
  return VALUE_BAND_ORDER.filter((id) => (map.get(id)?.length ?? 0) > 0).map(
    (bandId) => ({ bandId, players: map.get(bandId)! }),
  );
}

export type ValueBandStats = {
  bandId: ValueBandId;
  label: string;
  shortRange: string;
  players: Player[];
  positionCounts: Record<string, number>;
  averageValueRaw: number;
  minValueRaw: number;
  maxValueRaw: number;
  minValueDisplay: number;
  maxValueDisplay: number;
  minCoreValueDisplay: number;
  shelvedCount: number;
  valuedPlayerCount: number;
  draftedCount: number;
  availableCount: number;
  cliffToNextBandRaw: number | null;
  topPlayerNames: string[];
  isMinBidStyleBand: boolean;
  isFlatValueBand: boolean;
  /** Engine auction_tier → count within this band. */
  engineTierCounts: Record<number, number>;
  /** Most common Engine tier in the band, if any. */
  dominantEngineTier: number | null;
};

export function formatCliffToNextBandLabel(args: {
  cliffRaw: number | null;
  isMinBidStyleBand: boolean;
  isFlatValueBand: boolean;
  hasNextBand: boolean;
}): string {
  const tierish = formatCliffToNextTierLabel({
    cliffRaw: args.cliffRaw,
    isMinBidStyleTier: args.isMinBidStyleBand,
    isFlatValueBand: args.isFlatValueBand,
    hasNextTier: args.hasNextBand,
    tierNumber: 0,
  });
  if (tierish === "$0 drop after tier") return "No meaningful drop";
  return tierish.replace(/after tier$/i, "after band");
}

export function isDeemphasizedValueBand(stat: ValueBandStats): boolean {
  return (
    stat.isMinBidStyleBand ||
    stat.bandId === "unvalued" ||
    stat.bandId === "reserve_1"
  );
}

export function calculateValueBandStats(
  groups: ValueBandGroup[],
  draftedIds: ReadonlySet<string>,
  rosterSlotKeys?: readonly string[] | null,
): ValueBandStats[] {
  const stats: ValueBandStats[] = [];

  for (let idx = 0; idx < groups.length; idx++) {
    const group = groups[idx];
    const def = valueBandDef(group.bandId);
    const valuedPlayers = tierPlayersWithAuctionValue(group.players);
    let totalValueRaw = 0;
    let minValueRaw = Infinity;
    let maxValueRaw = -Infinity;
    let draftedCount = 0;

    for (const p of group.players) {
      if (draftedIds.has(p.id) || draftedIds.has(String(p.mlbId))) {
        draftedCount++;
      }
    }

    for (const p of valuedPlayers) {
      const value = rawTierAuctionValue(p)!;
      totalValueRaw += value;
      minValueRaw = Math.min(minValueRaw, value);
      maxValueRaw = Math.max(maxValueRaw, value);
    }

    const engineTierCounts: Record<number, number> = {};
    for (const p of group.players) {
      const t = displayAuctionTier(p);
      if (t != null) {
        engineTierCounts[t] = (engineTierCounts[t] ?? 0) + 1;
      }
    }
    let dominantEngineTier: number | null = null;
    let dominantCount = 0;
    for (const [tier, count] of Object.entries(engineTierCounts)) {
      if (count > dominantCount) {
        dominantCount = count;
        dominantEngineTier = Number(tier);
      }
    }

    const availableCount = group.players.length - draftedCount;
    const positionCounts = countResearchTablePositionParts(
      group.players,
      rosterSlotKeys,
    );
    const valuedPlayerCount = valuedPlayers.length;
    const averageValueRaw =
      valuedPlayerCount > 0 ? totalValueRaw / valuedPlayerCount : 0;

    const minDisplay =
      minValueRaw === Infinity
        ? 0
        : displayAuctionValue({ auction_value: minValueRaw });
    const maxDisplay =
      maxValueRaw === -Infinity
        ? 0
        : displayAuctionValue({ auction_value: maxValueRaw });
    const coreFloorRaw = tierMeaningfulFloorRaw(group.players);
    const minCoreDisplay =
      coreFloorRaw > 0
        ? displayAuctionValue({ auction_value: coreFloorRaw })
        : minDisplay;
    const shelvedCount = tierShelvedCount(group.players);

    const nextGroup = idx < groups.length - 1 ? groups[idx + 1] : null;
    let cliffToNextBandRaw: number | null = null;
    if (nextGroup && valuedPlayerCount > 0) {
      const nextValued = tierPlayersWithAuctionValue(nextGroup.players);
      if (nextValued.length > 0) {
        let nextMaxRaw = -Infinity;
        for (const p of nextValued) {
          nextMaxRaw = Math.max(nextMaxRaw, rawTierAuctionValue(p)!);
        }
        const floorForCliff =
          coreFloorRaw >= MEANINGFUL_BAND_FLOOR_RAW
            ? coreFloorRaw
            : minValueRaw === Infinity
              ? 0
              : minValueRaw;
        cliffToNextBandRaw = floorForCliff - nextMaxRaw;
      }
    }

    const spreadRaw =
      minValueRaw === Infinity || maxValueRaw === -Infinity
        ? 0
        : maxValueRaw - minValueRaw;
    const isFlatValueBand = spreadRaw < MEANINGFUL_CLIFF_RAW_THRESHOLD;
    const isMinBidStyleBand =
      valuedPlayerCount >= 5 &&
      maxDisplay < MEANINGFUL_BAND_FLOOR_RAW &&
      averageValueRaw < MEANINGFUL_BAND_FLOOR_RAW;

    stats.push({
      bandId: group.bandId,
      label: def.label,
      shortRange: def.shortRange,
      players: group.players,
      positionCounts,
      averageValueRaw,
      minValueRaw: minValueRaw === Infinity ? 0 : minValueRaw,
      maxValueRaw: maxValueRaw === -Infinity ? 0 : maxValueRaw,
      minValueDisplay: minDisplay,
      maxValueDisplay: maxDisplay,
      minCoreValueDisplay: minCoreDisplay,
      shelvedCount,
      valuedPlayerCount,
      draftedCount,
      availableCount,
      cliffToNextBandRaw,
      topPlayerNames: topPlayerNamesByAuctionValue(group.players, 5),
      isMinBidStyleBand,
      isFlatValueBand,
      engineTierCounts,
      dominantEngineTier,
    });
  }

  return stats;
}

export function buildValueBandViewForPosition(
  players: Player[],
  draftedIds: ReadonlySet<string>,
  positionFilter: string,
  rosterSlotKeys?: readonly string[] | null,
): ValueBandStats[] {
  const filtered =
    positionFilter === "all"
      ? players
      : players.filter((p) => p.position === positionFilter);

  const groups = groupPlayersByValueBand(filtered);
  return calculateValueBandStats(groups, draftedIds, rosterSlotKeys);
}

export function formatValueBandDisplay(
  stat: Pick<
    ValueBandStats,
    | "minValueDisplay"
    | "maxValueDisplay"
    | "minCoreValueDisplay"
    | "shelvedCount"
    | "valuedPlayerCount"
    | "shortRange"
  >,
): { rangeLabel: string; shelfNote: string | null } {
  if (stat.valuedPlayerCount === 0) {
    return { rangeLabel: stat.shortRange, shelfNote: null };
  }
  const band = formatTierBandDisplay(stat);
  if (band.rangeLabel === "—" && stat.shortRange !== "—") {
    return { rangeLabel: stat.shortRange, shelfNote: null };
  }
  return band;
}

export function engineTierMixLabel(stat: ValueBandStats): string | null {
  const entries = Object.entries(stat.engineTierCounts)
    .map(([t, c]) => ({ tier: Number(t), count: c }))
    .filter((e) => e.count > 0)
    .sort((a, b) => a.tier - b.tier);
  if (entries.length === 0) return null;
  if (entries.length === 1) {
    return `Engine tier ${entries[0]!.tier}`;
  }
  return entries.map((e) => `T${e.tier}×${e.count}`).join(" · ");
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

const VALUE_THRESHOLDS = [30, 20, 10, 5, 2, 1] as const;

export type TierSeparationDiagnosis = "A" | "B" | "C" | "D";

export type EngineTierAuditSummary = {
  tier: string | number;
  playerCount: number;
  remainingCount: number;
  raw: {
    min: number;
    p10: number;
    p25: number;
    median: number;
    p75: number;
    p90: number;
    max: number;
    average: number;
  };
  displayedMin: number;
  displayedMax: number;
  aboveThresholds: Record<(typeof VALUE_THRESHOLDS)[number], number>;
  minBidCount: number;
  topPlayers: Array<{ name: string; raw: number; rank: number | null }>;
  positionCounts: Record<string, number>;
};

export type TierBoundaryAudit = {
  higherTier: string | number;
  lowerTier: string | number;
  bottomHigher: Array<{ name: string; raw: number; display: number; rank: number | null }>;
  topLower: Array<{ name: string; raw: number; display: number; rank: number | null }>;
  rawGap: number | null;
  displayGap: number | null;
  rankGap: number | null;
  meaningfulCliff: boolean;
  roundedAway: boolean;
};

export type ValueBandAuditSummary = {
  bandId: ValueBandId;
  label: string;
  count: number;
  averageAdp: number | null;
  engineTierOverlap: Record<number, number>;
  topPlayers: string[];
  positionCounts: Record<string, number>;
};

export type TierSeparationAuditReport = {
  diagnosis: TierSeparationDiagnosis;
  diagnosisSummary: string;
  recommendation: string;
  byEngineTier: EngineTierAuditSummary[];
  boundaries: TierBoundaryAudit[];
  byValueBand: ValueBandAuditSummary[];
};

function playerRank(p: Player): number | null {
  return typeof p.auction_rank === "number" && Number.isFinite(p.auction_rank)
    ? p.auction_rank
    : null;
}

function summarizeEngineTier(stat: TierStats): EngineTierAuditSummary {
  const raws = tierPlayersWithAuctionValue(stat.players)
    .map((p) => rawTierAuctionValue(p)!)
    .sort((a, b) => a - b);

  const aboveThresholds = Object.fromEntries(
    VALUE_THRESHOLDS.map((t) => [
      t,
      raws.filter((v) => v >= t).length,
    ]),
  ) as Record<(typeof VALUE_THRESHOLDS)[number], number>;

  const minBidCount = raws.filter((v) => v < MEANINGFUL_BAND_FLOOR_RAW).length;

  const topPlayers = [...tierPlayersWithAuctionValue(stat.players)]
    .sort((a, b) => (rawTierAuctionValue(b) ?? 0) - (rawTierAuctionValue(a) ?? 0))
    .slice(0, 10)
    .map((p) => ({
      name: p.name,
      raw: rawTierAuctionValue(p)!,
      rank: playerRank(p),
    }));

  return {
    tier: stat.tier,
    playerCount: stat.players.length,
    remainingCount: stat.availableCount,
    raw: {
      min: raws[0] ?? 0,
      p10: percentile(raws, 0.1),
      p25: percentile(raws, 0.25),
      median: percentile(raws, 0.5),
      p75: percentile(raws, 0.75),
      p90: percentile(raws, 0.9),
      max: raws[raws.length - 1] ?? 0,
      average: stat.averageValueRaw,
    },
    displayedMin: stat.minValueDisplay,
    displayedMax: stat.maxValueDisplay,
    aboveThresholds,
    minBidCount,
    topPlayers,
    positionCounts: stat.positionCounts,
  };
}

function auditBoundary(
  higher: TierStats,
  lower: TierStats,
): TierBoundaryAudit {
  const higherValued = [...tierPlayersWithAuctionValue(higher.players)].sort(
    (a, b) => (rawTierAuctionValue(a) ?? 0) - (rawTierAuctionValue(b) ?? 0),
  );
  const lowerValued = [...tierPlayersWithAuctionValue(lower.players)].sort(
    (a, b) => (rawTierAuctionValue(b) ?? 0) - (rawTierAuctionValue(a) ?? 0),
  );

  const bottomHigher = higherValued.slice(0, 10).map((p) => ({
    name: p.name,
    raw: rawTierAuctionValue(p)!,
    display: displayAuctionValue(p),
    rank: playerRank(p),
  }));
  const topLower = lowerValued.slice(0, 10).map((p) => ({
    name: p.name,
    raw: rawTierAuctionValue(p)!,
    display: displayAuctionValue(p),
    rank: playerRank(p),
  }));

  const rawGap =
    bottomHigher[0] && topLower[0]
      ? bottomHigher[0].raw - topLower[0].raw
      : null;
  const displayGap =
    bottomHigher[0] && topLower[0]
      ? bottomHigher[0].display - topLower[0].display
      : null;
  const rankGap =
    bottomHigher[0]?.rank != null && topLower[0]?.rank != null
      ? topLower[0].rank! - bottomHigher[0].rank!
      : null;

  const meaningfulCliff =
    rawGap != null && rawGap >= MEANINGFUL_CLIFF_RAW_THRESHOLD;
  const roundedAway =
    rawGap != null &&
    rawGap >= MEANINGFUL_CLIFF_RAW_THRESHOLD &&
    displayGap != null &&
    displayGap < MEANINGFUL_CLIFF_RAW_THRESHOLD;

  return {
    higherTier: higher.tier,
    lowerTier: lower.tier,
    bottomHigher,
    topLower,
    rawGap,
    displayGap,
    rankGap,
    meaningfulCliff,
    roundedAway,
  };
}

export function diagnoseTierSeparation(
  engineStats: TierStats[],
  bandStats: ValueBandStats[],
): Pick<
  TierSeparationAuditReport,
  "diagnosis" | "diagnosisSummary" | "recommendation"
> {
  const tier1 = engineStats.find((s) => s.tier === 1);
  const lower = engineStats.filter(
    (s) => s.tier !== 1 && s.tier !== "unassigned",
  );
  const lowerMinBid = lower.filter((s) => s.isMinBidStyleTier).length;
  const flatLower = isBoardMostlyFlatAfterTopTier(engineStats);
  const meaningfulBands = bandStats.filter(
    (b) => b.maxValueDisplay >= 10 && !b.isMinBidStyleBand,
  );

  if (
    tier1 &&
    flatLower &&
    lowerMinBid >= Math.max(1, lower.length - 1) &&
    meaningfulBands.length >= 2
  ) {
    return {
      diagnosis: "C",
      diagnosisSummary:
        "Meaningful auction dollars cluster in multiple raw value bands, mostly inside Engine tier 1, while tiers 2–5 collapse to min-bid shelves.",
      recommendation:
        "Show value bands as the primary Research view; keep Engine auction tier as secondary row metadata.",
    };
  }

  if (tier1 && flatLower && lowerMinBid >= Math.max(1, lower.length - 1)) {
    return {
      diagnosis: "B",
      diagnosisSummary:
        "Engine tiers 2–5 are replacement/min-bid shelves after Stage 2; tier 1 holds nearly all strategic auction value.",
      recommendation:
        "Pivot the Tiers page to raw value bands and de-emphasize lower Engine tiers.",
    };
  }

  const distinctLower = lower.filter(
    (s) => !s.isMinBidStyleTier && s.maxValueDisplay >= MEANINGFUL_BAND_FLOOR_RAW,
  );
  if (distinctLower.length >= 2) {
    return {
      diagnosis: "A",
      diagnosisSummary:
        "Engine tier buckets still separate meaningful dollar ranges; UI should explain ranges and cliffs per tier.",
      recommendation:
        "Keep Engine tiers as the primary grouping with clearer band labels inside each tier.",
    };
  }

  return {
    diagnosis: "D",
    diagnosisSummary:
      "Tier boundaries do not align cleanly with auction rank or raw value cliffs; revisit Engine auction_tier assignment in a later API pass.",
    recommendation:
      "Use value bands on the web now; schedule Engine tier boundary review when changing valuation.",
  };
}

export function runTierSeparationAudit(
  players: Player[],
  draftedIds: ReadonlySet<string>,
  rosterSlotKeys?: readonly string[] | null,
): TierSeparationAuditReport {
  const engineGroups = groupPlayersByTier(players);
  const engineStats = calculateTierStats(
    engineGroups,
    draftedIds,
    rosterSlotKeys,
  );
  const bandStats = calculateValueBandStats(
    groupPlayersByValueBand(players),
    draftedIds,
    rosterSlotKeys,
  );

  const byEngineTier = engineStats.map((s) =>
    summarizeEngineTier(s),
  );

  const boundaries: TierBoundaryAudit[] = [];
  for (let i = 0; i < engineStats.length - 1; i++) {
    boundaries.push(auditBoundary(engineStats[i]!, engineStats[i + 1]!));
  }

  const byValueBand: ValueBandAuditSummary[] = bandStats.map((b) => {
    const adps = b.players
      .map((p) => p.market_adp)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return {
      bandId: b.bandId,
      label: b.label,
      count: b.players.length,
      averageAdp:
        adps.length > 0 ? adps.reduce((a, v) => a + v, 0) / adps.length : null,
      engineTierOverlap: b.engineTierCounts,
      topPlayers: b.topPlayerNames,
      positionCounts: b.positionCounts,
    };
  });

  const { diagnosis, diagnosisSummary, recommendation } = diagnoseTierSeparation(
    engineStats,
    bandStats,
  );

  return {
    diagnosis,
    diagnosisSummary,
    recommendation,
    byEngineTier,
    boundaries,
    byValueBand,
  };
}

/** Re-export tier sort for the value-band table. */
export { sortPlayersInTier, isDeemphasizedTier };
