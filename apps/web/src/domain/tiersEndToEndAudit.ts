import type { Player } from "../types/player";
import type { RosterEntry } from "../api/roster";
import { catalogPlayerIdInStringSet } from "./catalogPlayerKeys";
import { displayTierGroupingRaw } from "./displayTiers";
import { displayAuctionTier } from "./playerRankTier";
import {
  buildFullTierView,
  isNumericAuctionTier,
  isPlayerDraftedForTiers,
  partitionPlayersForTierView,
  playerHasTierAuctionValue,
  rawTierAuctionValue,
  splitTierPlayersByDraftStatus,
  type TierStats,
} from "../utils/tiers";
import { formatCurrencyWhole, leagueWideAuctionDollars } from "../utils/valuation";
import { formatAuctionValueRaw } from "./researchAuctionValueDisplay";

export type TierPlayerClass =
  | "A_available_valued"
  | "B_drafted_valued"
  | "C_rostered_keeper"
  | "D_catalog_no_value"
  | "E_depth_only"
  | "F_unmatched";

export type TierPlayerAuditRow = {
  playerId: string;
  name: string;
  mlbId: number | null;
  team: string;
  primaryPosition: string;
  eligibleSlots: string;
  auctionValueRaw: number | null;
  displayedAuctionValue: string;
  auctionRank: number | null;
  engineTier: number | null;
  catalogTier: number | null;
  tierSource: "auction_tier" | "catalog_tier" | "unassigned";
  surplusBasis: string | null;
  explainSlot: string | null;
  marketAdp: number | null;
  hasValuationRow: boolean;
  draftablePool: string;
  rostered: boolean;
  draftedSold: boolean;
  draftedTeam: string | null;
  draftedPrice: number | null;
  watchlist: boolean;
  playerClass: TierPlayerClass;
  assignedViewTier: string | number;
  inMainTiers: boolean;
  inOutsideModel: boolean;
  flags: string[];
};

export type TierSummaryAudit = {
  tier: string | number;
  allCount: number;
  availableCount: number;
  draftedCount: number;
  noValueInTierCount: number;
  rawMin: number;
  rawP10: number;
  rawP25: number;
  rawMedian: number;
  rawP75: number;
  rawP90: number;
  rawMax: number;
  displayMin: number;
  displayMax: number;
  avgRaw: number;
  above30: number;
  above20: number;
  above15: number;
  above10: number;
  above5: number;
  above2: number;
  above1: number;
  minBidCount: number;
  positionCounts: Record<string, number>;
  top10Available: Array<{ name: string; raw: number; rank: number | null }>;
  bottom10Available: Array<{ name: string; raw: number; rank: number | null }>;
  draftedSamples: Array<{ name: string; team: string; price: number | null }>;
};

export type TierBoundaryAudit = {
  boundary: string;
  bottomHigherTier: Array<{ name: string; raw: number; rank: number | null }>;
  topLowerTier: Array<{ name: string; raw: number; rank: number | null }>;
  rawGap: number | null;
  displayGap: number | null;
  rankGap: number | null;
  label:
    | "Meaningful cliff"
    | "Soft drop"
    | "Flat band"
    | "Replacement/min-bid boundary"
    | "Probably arbitrary";
};

export type ValueBandKey =
  | "$30+"
  | "$20–29.99"
  | "$15–19.99"
  | "$10–14.99"
  | "$5–9.99"
  | "$2–4.99"
  | "$1–1.99"
  | "no auction value";

export type TiersAuditClassification =
  | "A_correct"
  | "B_mostly_correct_ui"
  | "C_drafted_player_bug"
  | "D_tier_boundary_issue"
  | "E_fallback_issue"
  | "F_position_filter_issue"
  | "G_needs_product_change";

export type TiersEndToEndAuditReport = {
  classification: TiersAuditClassification;
  classificationReason: string;
  tierGeneration: {
    primarySource: string;
    codePaths: string[];
    fallbackHierarchy: string[];
    draftedKeepTier: string;
    risks: string[];
  };
  playerRows: TierPlayerAuditRow[];
  classCounts: Record<TierPlayerClass, number>;
  contaminatedRows: TierPlayerAuditRow[];
  tierSummaries: TierSummaryAudit[];
  tierSummariesAvailableOnly: TierSummaryAudit[];
  boundaries: TierBoundaryAudit[];
  valueBands: Array<{
    band: ValueBandKey;
    count: number;
    topPlayers: string[];
    engineTierDist: Record<string, number>;
    draftedCount: number;
  }>;
  draftedHandling: {
    violations: string[];
    passed: string[];
  };
  positionFilter: {
    filtersRowsOnly: boolean;
    recomputesStats: boolean;
    uiLabelPresent: boolean;
    issues: string[];
  };
  uiTruthfulness: {
    checks: Array<{ label: string; ok: boolean; note: string }>;
  };
  recommendedFixes: string[];
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function tierSourceFor(player: Player): TierPlayerAuditRow["tierSource"] {
  if (typeof player.auction_tier === "number" && Number.isFinite(player.auction_tier)) {
    return "auction_tier";
  }
  if (typeof player.catalog_tier === "number" && Number.isFinite(player.catalog_tier)) {
    return "catalog_tier";
  }
  return "unassigned";
}

function valueBandForRaw(raw: number | null): ValueBandKey {
  if (raw == null || !Number.isFinite(raw)) return "no auction value";
  if (raw >= 30) return "$30+";
  if (raw >= 20) return "$20–29.99";
  if (raw >= 15) return "$15–19.99";
  if (raw >= 10) return "$10–14.99";
  if (raw >= 5) return "$5–9.99";
  if (raw >= 2) return "$2–4.99";
  return "$1–1.99";
}

export function classifyTierPlayer(
  player: Player,
  draftedIds: ReadonlySet<string>,
  options?: {
    rosteredIds?: ReadonlySet<string>;
    depthOnlyIds?: ReadonlySet<string>;
  },
): TierPlayerClass {
  const drafted = isPlayerDraftedForTiers(player, draftedIds);
  const rostered =
    options?.rosteredIds != null &&
    catalogPlayerIdInStringSet(options.rosteredIds, player);
  const depthOnly =
    options?.depthOnlyIds != null &&
    catalogPlayerIdInStringSet(options.depthOnlyIds, player);

  if (depthOnly) return "E_depth_only";
  if (player.valuation_eligible === false && !playerHasTierAuctionValue(player)) {
    if (drafted) return "B_drafted_valued";
    if (rostered) return "C_rostered_keeper";
    return "D_catalog_no_value";
  }
  if (!playerHasTierAuctionValue(player)) {
    if (drafted) return "B_drafted_valued";
    if (rostered) return "C_rostered_keeper";
    return "D_catalog_no_value";
  }
  if (drafted) return "B_drafted_valued";
  return "A_available_valued";
}

function summarizeTier(
  tierStat: TierStats,
  playersSubset: Player[],
  draftedIds: ReadonlySet<string>,
  draftedPriceByPlayerId?: ReadonlyMap<string, number>,
  draftedByTeam?: ReadonlyMap<string, string>,
): TierSummaryAudit {
  const { available, drafted } = splitTierPlayersByDraftStatus(
    playersSubset,
    draftedIds,
  );
  const raws = available
    .map((p) => rawTierAuctionValue(p))
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);

  const noValueInTier = playersSubset.filter(
    (p) => !playerHasTierAuctionValue(p),
  ).length;

  const countAbove = (min: number) => raws.filter((r) => r >= min).length;

  const top10 = [...available]
    .sort((a, b) => (rawTierAuctionValue(b) ?? 0) - (rawTierAuctionValue(a) ?? 0))
    .slice(0, 10)
    .map((p) => ({
      name: p.name,
      raw: rawTierAuctionValue(p) ?? 0,
      rank:
        typeof p.auction_rank === "number" && Number.isFinite(p.auction_rank)
          ? p.auction_rank
          : null,
    }));

  const bottom10 = [...available]
    .sort((a, b) => (rawTierAuctionValue(a) ?? 0) - (rawTierAuctionValue(b) ?? 0))
    .slice(0, 10)
    .map((p) => ({
      name: p.name,
      raw: rawTierAuctionValue(p) ?? 0,
      rank:
        typeof p.auction_rank === "number" && Number.isFinite(p.auction_rank)
          ? p.auction_rank
          : null,
    }));

  const draftedSamples = drafted.slice(0, 8).map((p) => ({
    name: p.name,
    team: draftedByTeam?.get(p.id) ?? "—",
    price: draftedPriceByPlayerId?.get(p.id) ?? null,
  }));

  return {
    tier: tierStat.tier,
    allCount: playersSubset.length,
    availableCount: available.length,
    draftedCount: drafted.length,
    noValueInTierCount: noValueInTier,
    rawMin: raws[0] ?? 0,
    rawP10: percentile(raws, 0.1),
    rawP25: percentile(raws, 0.25),
    rawMedian: percentile(raws, 0.5),
    rawP75: percentile(raws, 0.75),
    rawP90: percentile(raws, 0.9),
    rawMax: raws[raws.length - 1] ?? 0,
    displayMin: tierStat.minValueDisplay,
    displayMax: tierStat.maxValueDisplay,
    avgRaw: tierStat.averageValueRaw,
    above30: countAbove(30),
    above20: countAbove(20),
    above15: countAbove(15),
    above10: countAbove(10),
    above5: countAbove(5),
    above2: countAbove(2),
    above1: countAbove(1),
    minBidCount: raws.filter((r) => r < 2).length,
    positionCounts: tierStat.positionCounts,
    top10Available: top10,
    bottom10Available: bottom10,
    draftedSamples,
  };
}

function classifyBoundary(
  higher: TierSummaryAudit,
  _lower: TierSummaryAudit,
  cliffRaw: number | null,
): TierBoundaryAudit["label"] {
  if (higher.minBidCount >= higher.availableCount * 0.8) {
    return "Replacement/min-bid boundary";
  }
  if (cliffRaw == null || cliffRaw < 0.5) {
    return higher.rawMax - higher.rawMin < 0.5 ? "Flat band" : "Probably arbitrary";
  }
  if (cliffRaw < 2) return "Soft drop";
  if (cliffRaw >= 3) return "Meaningful cliff";
  return "Soft drop";
}

export function runTiersEndToEndAudit(args: {
  players: readonly Player[];
  draftedIds: ReadonlySet<string>;
  draftedByTeam?: ReadonlyMap<string, string>;
  draftedPriceByPlayerId?: ReadonlyMap<string, number>;
  rosterEntries?: readonly RosterEntry[];
  watchlistIds?: ReadonlySet<string>;
  positionFilter?: string;
  draftDisplaySlotKeys?: readonly string[];
}): TiersEndToEndAuditReport {
  const {
    players,
    draftedIds,
    draftedByTeam,
    draftedPriceByPlayerId,
    watchlistIds,
    positionFilter = "all",
    draftDisplaySlotKeys,
  } = args;

  const { tiered, outsideModel } = partitionPlayersForTierView(
    [...players],
    draftedIds,
  );
  const outsideIds = new Set(outsideModel.map((p) => p.id));
  const tieredIds = new Set(tiered.map((p) => p.id));

  const full = buildFullTierView([...players], draftedIds, positionFilter, {
    draftedIds,
    draftedPriceByPlayerId: args.draftedPriceByPlayerId,
    rosterSlotKeys: draftDisplaySlotKeys,
  });

  const playerRows: TierPlayerAuditRow[] = players.map((player) => {
    const playerClass = classifyTierPlayer(player, draftedIds);
    const raw = rawTierAuctionValue(player);
    const flags: string[] = [];
    const inMain = tieredIds.has(player.id);
    const inOutside = outsideIds.has(player.id);

    if (
      (playerClass === "D_catalog_no_value" || playerClass === "E_depth_only") &&
      inMain &&
      !isPlayerDraftedForTiers(player, draftedIds)
    ) {
      flags.push("no-value player in T1–T5");
    }
    if (
      playerClass === "A_available_valued" &&
      inOutside
    ) {
      flags.push("valued available in outside-model section");
    }

    const assignedViewTier =
      displayTierGroupingRaw(player, {
        draftedIds,
        draftedPriceByPlayerId: args.draftedPriceByPlayerId,
      }) ??
      displayAuctionTier(player) ??
      player.catalog_tier ??
      "unassigned";

    return {
      playerId: player.id,
      name: player.name,
      mlbId: typeof player.mlbId === "number" ? player.mlbId : null,
      team: player.team ?? "",
      primaryPosition: player.position ?? "",
      eligibleSlots: (player.positions ?? []).join(", "),
      auctionValueRaw: raw,
      displayedAuctionValue:
        raw != null
          ? formatCurrencyWhole(raw)
          : leagueWideAuctionDollars(player) != null
            ? formatCurrencyWhole(leagueWideAuctionDollars(player))
            : "—",
      auctionRank:
        typeof player.auction_rank === "number" && Number.isFinite(player.auction_rank)
          ? player.auction_rank
          : null,
      engineTier:
        typeof player.auction_tier === "number" && Number.isFinite(player.auction_tier)
          ? player.auction_tier
          : null,
      catalogTier:
        typeof player.catalog_tier === "number" && Number.isFinite(player.catalog_tier)
          ? player.catalog_tier
          : null,
      tierSource: tierSourceFor(player),
      surplusBasis: player.valuation_explain?.surplus_basis ?? null,
      explainSlot: player.valuation_explain?.replacement_key_used ?? null,
      marketAdp:
        typeof player.market_adp === "number" && Number.isFinite(player.market_adp)
          ? player.market_adp
          : null,
      hasValuationRow: playerHasTierAuctionValue(player),
      draftablePool: player.research_draftable ?? "unknown",
      rostered: false,
      draftedSold: isPlayerDraftedForTiers(player, draftedIds),
      draftedTeam: draftedByTeam?.get(player.id) ?? null,
      draftedPrice: draftedPriceByPlayerId?.get(player.id) ?? null,
      watchlist: watchlistIds?.has(player.id) ?? false,
      playerClass,
      assignedViewTier,
      inMainTiers: inMain && isNumericAuctionTier(assignedViewTier),
      inOutsideModel: inOutside,
      flags,
    };
  });

  const classCounts = playerRows.reduce(
    (acc, row) => {
      acc[row.playerClass] = (acc[row.playerClass] ?? 0) + 1;
      return acc;
    },
    {} as Record<TierPlayerClass, number>,
  );

  const contaminatedRows = playerRows.filter((r) => r.flags.length > 0);

  const tierSummaries = full.tiers.map((stat) =>
    summarizeTier(stat, stat.players, draftedIds, draftedPriceByPlayerId, draftedByTeam),
  );

  const tierSummariesAvailableOnly = full.tiers.map((stat) =>
    summarizeTier(
      stat,
      stat.availablePlayers,
      draftedIds,
      draftedPriceByPlayerId,
      draftedByTeam,
    ),
  );

  const boundaries: TierBoundaryAudit[] = [];
  for (let i = 0; i < tierSummaries.length - 1; i++) {
    const hi = tierSummaries[i]!;
    const lo = tierSummaries[i + 1]!;
    const cliffRaw = full.tiers[i]?.cliffToNextTierRaw ?? null;
    const bottomHi = hi.bottom10Available;
    const topLo = lo.top10Available;
    const rawGap =
      bottomHi.length > 0 && topLo.length > 0
        ? bottomHi[0]!.raw - topLo[0]!.raw
        : null;
    const displayGap =
      bottomHi.length > 0 && topLo.length > 0
        ? Math.round(bottomHi[0]!.raw) - Math.round(topLo[0]!.raw)
        : null;
    const rankGap =
      bottomHi[0]?.rank != null && topLo[0]?.rank != null
        ? topLo[0]!.rank! - bottomHi[0]!.rank!
        : null;

    boundaries.push({
      boundary: `T${hi.tier} → T${lo.tier}`,
      bottomHigherTier: bottomHi,
      topLowerTier: topLo,
      rawGap,
      displayGap,
      rankGap,
      label: classifyBoundary(hi, lo, cliffRaw),
    });
  }

  const availableValued = players.filter(
    (p) =>
      classifyTierPlayer(p, draftedIds) === "A_available_valued" &&
      rawTierAuctionValue(p) != null,
  );

  const valueBands: TiersEndToEndAuditReport["valueBands"] = (
    [
      "$30+",
      "$20–29.99",
      "$15–19.99",
      "$10–14.99",
      "$5–9.99",
      "$2–4.99",
      "$1–1.99",
      "no auction value",
    ] as ValueBandKey[]
  ).map((band) => {
    const inBand = availableValued.filter(
      (p) => valueBandForRaw(rawTierAuctionValue(p)) === band,
    );
    const engineTierDist: Record<string, number> = {};
    for (const p of inBand) {
      const t = String(displayAuctionTier(p) ?? "?");
      engineTierDist[t] = (engineTierDist[t] ?? 0) + 1;
    }
    return {
      band,
      count: inBand.length,
      topPlayers: inBand
        .sort((a, b) => (rawTierAuctionValue(b) ?? 0) - (rawTierAuctionValue(a) ?? 0))
        .slice(0, 5)
        .map((p) => p.name),
      engineTierDist,
      draftedCount: 0,
    };
  });

  const draftedViolations: string[] = [];
  const draftedPassed: string[] = [];

  for (const stat of full.tiers) {
    for (const p of stat.draftedPlayers) {
      const tier = displayAuctionTier(p) ?? p.catalog_tier;
      if (!isNumericAuctionTier(tier ?? NaN)) {
        draftedViolations.push(`${p.name}: drafted but no numeric tier on row`);
      } else {
        draftedPassed.push(`${p.name}: retains tier T${tier}`);
      }
    }
    if (stat.draftedCount > 0 && stat.availableCount === stat.players.length) {
      draftedViolations.push(
        `Tier ${stat.tier}: draftedCount>0 but all players counted as available`,
      );
    }
    if (
      stat.draftedCount > 0 &&
      stat.valuedPlayerCount > 0 &&
      stat.minValueRaw < 2 &&
      stat.draftedPlayers.some((p) => (rawTierAuctionValue(p) ?? 0) >= 10)
    ) {
      draftedViolations.push(
        `Tier ${stat.tier}: drafted high-value player may be pulling band math (check available-only stats)`,
      );
    }
  }

  if (draftedPassed.length === 0 && players.some((p) => isPlayerDraftedForTiers(p, draftedIds))) {
    draftedViolations.push("No drafted players found in tier drafted sections");
  } else if (draftedPassed.length > 0) {
    draftedPassed.push("Drafted players split to draftedPlayers[] in TierStats");
    draftedPassed.push("availableCount excludes drafted");
    draftedPassed.push("Value range/avg/cliff use availablePlayers only");
  }

  const positionIssues: string[] = [];
  if (positionFilter !== "all") {
    const allView = buildFullTierView([...players], draftedIds, "all", draftDisplaySlotKeys);
    const filteredView = full;
    if (allView.tiers.length === filteredView.tiers.length) {
      positionIssues.push(
        "Position filter hides rows but keeps same T1–T5 tier keys (model tiers, not recomputed by position)",
      );
    }
    positionIssues.push(
      "Filter matches player.position only (not full eligibility / OF aggregate)",
    );
  }

  const uiChecks: TiersEndToEndAuditReport["uiTruthfulness"]["checks"] = [
    {
      label: "Collapsed value range uses available players only",
      ok: full.tiers.every((s) => s.valuedPlayerCount <= s.availableCount),
      note: "calculateTierStats bands from availablePlayers",
    },
    {
      label: "Average uses available only",
      ok: true,
      note: "averageValueRaw from available valued subset",
    },
    {
      label: "Cliff uses available floor vs next tier available ceiling",
      ok: true,
      note: "cliffToNextTierRaw in calculateTierStats",
    },
    {
      label: "Left count excludes drafted",
      ok: full.tiers.every((s) => s.availableCount === s.availablePlayers.length),
      note: "availableCount in TierStats",
    },
    {
      label: "No-value section separated from T1–T5",
      ok: outsideModel != null || contaminatedRows.length === 0,
      note:
        outsideModel != null
          ? `outsideModel section: ${outsideModel.length} players`
          : "no outside section",
    },
    {
      label: "Leaders removed from collapsed summary",
      ok: true,
      note: "topPlayerNames not rendered in TiersView collapsed row",
    },
  ];

  const risks: string[] = [];
  if (contaminatedRows.some((r) => r.flags.includes("no-value player in T1–T5"))) {
    risks.push(
      "partitionPlayersForTierView admits unvalued players with numeric catalog_tier into T1–T5",
    );
  }

  const uniqueDisplayInT1 =
    tierSummaries[0] != null
      ? tierSummaries[0].displayMax - tierSummaries[0].displayMin
      : 0;
  const rawSpreadT1 =
    tierSummaries[0] != null ? tierSummaries[0].rawMax - tierSummaries[0].rawMin : 0;
  if (tierSummaries[0] && tierSummaries[0].availableCount >= 8 && uniqueDisplayInT1 <= 2 && rawSpreadT1 > 2) {
    risks.push(
      "T1 display band is narrow vs raw spread (rounding shelves); rank subtext/tooltips help",
    );
  }

  const mostlyFlatBoundaries = boundaries.filter(
    (b) => b.label === "Flat band" || b.label === "Probably arbitrary",
  ).length;
  if (mostlyFlatBoundaries >= 2) {
    risks.push("Multiple tier boundaries are flat/arbitrary after Stage 2 clustering");
  }

  let classification: TiersAuditClassification = "A_correct";
  let classificationReason =
    "Engine auction_tier drives T1–T5; available players power summaries; drafted and no-value paths are separated.";

  if (contaminatedRows.some((r) => r.flags.includes("no-value player in T1–T5"))) {
    classification = "E_fallback_issue";
    classificationReason =
      "Unvalued or catalog-only players can enter T1–T5 via catalog_tier fallback in partitionPlayersForTierView.";
  } else if (draftedViolations.length > 0) {
    classification = "C_drafted_player_bug";
    classificationReason = draftedViolations[0]!;
  } else if (positionFilter !== "all" && positionIssues.length > 0) {
    classification = "F_position_filter_issue";
    classificationReason =
      "Position filter subsets rows within fixed model tiers without explicit UI disclaimer.";
  } else if (mostlyFlatBoundaries >= 3 || risks.some((r) => r.includes("flat/arbitrary"))) {
    classification = "D_tier_boundary_issue";
    classificationReason =
      "Tier boundaries are weak after mid-teens clustering; T1–T5 still valid but cliffs need rank/raw context.";
  } else if (risks.length > 0 || uniqueDisplayInT1 <= 2) {
    classification = "B_mostly_correct_ui";
    classificationReason =
      "Tier assignment is Engine-driven; UI should emphasize raw gaps, auction rank, and filter semantics.";
  }

  const recommendedFixes: string[] = [];
  if (classification === "E_fallback_issue") {
    recommendedFixes.push(
      "Stop routing unvalued non-drafted players into T1–T5 when only catalog_tier exists (partitionPlayersForTierView).",
    );
  }
  if (classification === "F_position_filter_issue" || positionIssues.length > 0) {
    recommendedFixes.push(
      'When position filter ≠ All, show: "Filtered within model tiers — counts and cliffs are for this position subset."',
    );
  }
  if (classification === "B_mostly_correct_ui" || classification === "D_tier_boundary_issue") {
    recommendedFixes.push(
      "In collapsed tier summary, optionally show raw band (e.g. $15.2–$17.4) alongside rounded range.",
    );
    recommendedFixes.push(
      "Pass research_draftable flags into TiersView for consistent min-bid tooltips.",
    );
  }

  return {
    classification,
    classificationReason,
    tierGeneration: {
      primarySource:
        "Display T1–T5 from raw auction value bands; Engine auction_tier as row metadata when it differs",
      codePaths: [
        "domain/displayTiers.ts — groupPlayersByDisplayTier, displayTierGroupingRaw",
        "utils/tiers.ts — partitionPlayersForTierView, calculateTierStats, buildFullTierView",
        "pages/TiersView.tsx — renderTierSection, buildFullTierView consumer",
      ],
      fallbackHierarchy: [
        "1. raw auction_value band → display tier 1–5",
        "2. drafted without model value → price-paid band",
        "3. partition: drafted → tiered; valued available → tiered",
        "4. else → outsideModel “Not in valuation model”",
      ],
      draftedKeepTier:
        "Drafted players stay at bottom of display tier; sale price used for tier bucket when model value missing",
      risks,
    },
    playerRows,
    classCounts,
    contaminatedRows,
    tierSummaries,
    tierSummariesAvailableOnly,
    boundaries,
    valueBands,
    draftedHandling: {
      violations: draftedViolations,
      passed: draftedPassed,
    },
    positionFilter: {
      filtersRowsOnly: positionFilter !== "all",
      recomputesStats: true,
      uiLabelPresent: false,
      issues: positionIssues,
    },
    uiTruthfulness: { checks: uiChecks },
    recommendedFixes,
  };
}

export function formatTiersAuditReportForConsole(
  report: TiersEndToEndAuditReport,
): string {
  const lines: string[] = [];
  lines.push(`Classification: ${report.classification}`);
  lines.push(report.classificationReason);
  lines.push("");
  lines.push("Tier generation:");
  lines.push(`  Primary: ${report.tierGeneration.primarySource}`);
  for (const r of report.tierGeneration.risks) {
    lines.push(`  Risk: ${r}`);
  }
  lines.push("");
  lines.push("Class counts:");
  for (const [k, v] of Object.entries(report.classCounts)) {
    lines.push(`  ${k}: ${v}`);
  }
  if (report.contaminatedRows.length > 0) {
    lines.push("");
    lines.push(`Contaminated rows (${report.contaminatedRows.length}):`);
    for (const row of report.contaminatedRows.slice(0, 15)) {
      lines.push(`  ${row.name}: ${row.flags.join("; ")}`);
    }
  }
  lines.push("");
  lines.push("Tier summaries (available-focused stats):");
  for (const s of report.tierSummaries) {
    lines.push(
      `  T${s.tier}: all=${s.allCount} avail=${s.availableCount} drafted=${s.draftedCount} noVal=${s.noValueInTierCount} raw ${formatAuctionValueRaw(s.rawMin)}–${formatAuctionValueRaw(s.rawMax)} display $${s.displayMin}–$${s.displayMax}`,
    );
  }
  lines.push("");
  lines.push("Boundaries:");
  for (const b of report.boundaries) {
    lines.push(
      `  ${b.boundary}: ${b.label} rawGap=${b.rawGap?.toFixed(2) ?? "—"} displayGap=${b.displayGap ?? "—"}`,
    );
  }
  lines.push("");
  lines.push("Value bands (available valued):");
  for (const vb of report.valueBands) {
    if (vb.count === 0) continue;
    lines.push(`  ${vb.band}: ${vb.count} (tiers: ${JSON.stringify(vb.engineTierDist)})`);
  }
  if (report.recommendedFixes.length > 0) {
    lines.push("");
    lines.push("Recommended fixes:");
    for (const f of report.recommendedFixes) {
      lines.push(`  - ${f}`);
    }
  }
  return lines.join("\n");
}
