import { describe, it, expect } from "vitest";
import type { Player } from "../types/player";
import {
  auditTierInputs,
  buildFullTierView,
  buildTierViewForPosition,
  calculateTierStats,
  partitionPlayersForTierView,
  splitTierPlayersByDraftStatus,
  tierPlayerDisplayDollars,
  formatCliffToNextTierLabel,
  formatTierBandDisplay,
  formatTierValueRange,
  groupPlayersByTier,
  isDeemphasizedTier,
  sortPlayersInTier,
  topPlayerNamesByAuctionValue,
} from "./tiers";

function player(partial: Partial<Player> & { id: string }): Player {
  return {
    id: partial.id,
    mlbId: 1,
    name: partial.name ?? partial.id,
    team: "SEA",
    position: partial.position ?? "OF",
    age: 28,
    catalog_rank: 1,
    catalog_tier: partial.catalog_tier ?? 1,
    value: 1,
    headshot: "",
    stats: {},
    ...partial,
  } as Player;
}

describe("groupPlayersByTier", () => {
  it("groups players by tier and sorts numeric tiers ascending with unassigned last", () => {
    const players = [
      player({ id: "p1", catalog_tier: 2 }),
      player({ id: "p2", catalog_tier: 1 }),
      player({ id: "p3", catalog_tier: undefined as unknown as number }),
      player({ id: "p4", catalog_tier: 3 }),
    ];

    const groups = groupPlayersByTier(players);
    expect(groups.map((g) => g.tier)).toEqual([1, 2, 3, "unassigned"]);
  });
});

describe("calculateTierStats", () => {
  it("includes value range and top player names", () => {
    const players = [
      player({
        id: "p1",
        name: "Alpha",
        catalog_tier: 1,
        auction_value: 17,
        auction_tier: 1,
      }),
      player({
        id: "p2",
        name: "Beta",
        catalog_tier: 1,
        auction_value: 15,
        auction_tier: 1,
      }),
      player({
        id: "p3",
        name: "Gamma",
        catalog_tier: 2,
        auction_value: 9,
        auction_tier: 2,
      }),
    ];

    const stats = calculateTierStats(groupPlayersByTier(players), new Set());
    expect(stats[0].minValueDisplay).toBe(15);
    expect(stats[0].maxValueDisplay).toBe(17);
    expect(formatTierValueRange(stats[0].minValueDisplay, stats[0].maxValueDisplay)).toBe(
      "$15–$17",
    );
    expect(topPlayerNamesByAuctionValue(stats[0].players)).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("excludes players without Engine auction values from band math", () => {
    const players = [
      player({ id: "e1", auction_tier: 1, auction_value: 17 }),
      player({
        id: "m1",
        auction_tier: 1,
        valuation_eligible: false,
        auction_value: 99,
      }),
      player({
        id: "f1",
        auction_tier: 1,
        recommended_bid: 12,
        team_value: 8,
      }),
    ];
    const stat = calculateTierStats(groupPlayersByTier(players), new Set())[0];
    expect(stat.valuedPlayerCount).toBe(1);
    expect(stat.minValueDisplay).toBe(17);
    expect(stat.maxValueDisplay).toBe(17);
    expect(formatTierBandDisplay(stat).rangeLabel).toBe("$17");
  });

  it("shows min bid shelf instead of a $0–$1 range", () => {
    const players = Array.from({ length: 6 }, (_, i) =>
      player({
        id: `p${i}`,
        auction_tier: 5,
        auction_value: i % 2 === 0 ? 0 : 1,
        catalog_tier: 5,
      }),
    );
    const stat = calculateTierStats(groupPlayersByTier(players), new Set())[0];
    expect(formatTierBandDisplay(stat).rangeLabel).toBe("Min bid shelf");
    expect(formatTierValueRange(stat.minValueDisplay, stat.maxValueDisplay)).toBe(
      "Min bid shelf",
    );
  });

  it("excludes min-bid shelf from core band display when shelved players exist", () => {
    const players = [
      player({ id: "e1", auction_tier: 1, auction_value: 17 }),
      player({ id: "s1", auction_tier: 1, auction_value: 0 }),
      player({ id: "s2", auction_tier: 1, auction_value: 1 }),
    ];
    const stat = calculateTierStats(groupPlayersByTier(players), new Set())[0];
    const band = formatTierBandDisplay(stat);
    expect(band.rangeLabel).toBe("$17");
    expect(band.shelfNote).toMatch(/min bid/i);
  });

  it("computes cliff as floor of current tier minus ceiling of next tier (raw)", () => {
    const players = [
      player({ id: "p1", auction_tier: 1, auction_value: 17 }),
      player({ id: "p2", auction_tier: 1, auction_value: 15.2 }),
      player({ id: "p3", auction_tier: 2, auction_value: 9.8 }),
    ];
    const stats = calculateTierStats(groupPlayersByTier(players), new Set());
    expect(stats[0].cliffToNextTierRaw).toBeCloseTo(15.2 - 9.8, 5);
  });

  it("tracks drafted players", () => {
    const players = [
      player({ id: "p1", catalog_tier: 1, auction_value: 50 }),
      player({ id: "p2", catalog_tier: 2, auction_value: 30 }),
    ];
    const stats = calculateTierStats(
      groupPlayersByTier(players),
      new Set(["p1"]),
    );
    expect(stats[0].draftedCount).toBe(1);
    expect(stats[0].availableCount).toBe(0);
  });
});

describe("formatCliffToNextTierLabel", () => {
  it("uses drop after tier copy for meaningful cliffs", () => {
    expect(
      formatCliffToNextTierLabel({
        cliffRaw: 6,
        isMinBidStyleTier: false,
        isFlatValueBand: false,
        hasNextTier: true,
        tierNumber: 1,
      }),
    ).toBe("$6 drop after tier");
  });

  it("shows no meaningful drop for negligible cliffs", () => {
    expect(
      formatCliffToNextTierLabel({
        cliffRaw: 0.2,
        isMinBidStyleTier: false,
        isFlatValueBand: false,
        hasNextTier: true,
        tierNumber: 4,
      }),
    ).toBe("No meaningful drop");
  });

  it("shows no meaningful drop for flat bands instead of lowest-value copy", () => {
    expect(
      formatCliffToNextTierLabel({
        cliffRaw: 0.1,
        isMinBidStyleTier: false,
        isFlatValueBand: true,
        hasNextTier: true,
        tierNumber: 2,
      }),
    ).toBe("No meaningful drop");
    expect(
      formatCliffToNextTierLabel({
        cliffRaw: 2,
        isMinBidStyleTier: false,
        isFlatValueBand: false,
        hasNextTier: false,
        tierNumber: 5,
      }),
    ).toBe("No meaningful drop");
  });

  it("labels replacement pool for min-bid tiers", () => {
    expect(
      formatCliffToNextTierLabel({
        cliffRaw: 0,
        isMinBidStyleTier: true,
        isFlatValueBand: true,
        hasNextTier: false,
        tierNumber: 5,
      }),
    ).toBe("Replacement pool");
  });
});

describe("calculateTierStats positionCounts", () => {
  const leagueSlots = [
    "C",
    "1B",
    "2B",
    "SS",
    "3B",
    "CI",
    "MI",
    "OF",
    "UTIL",
    "SP",
    "RP",
    "BN",
  ];

  it("uses research-table position badges, not catalog position field alone", () => {
    const players = [
      player({
        id: "p1",
        position: "SS",
        positions: ["SS", "3B", "OF"],
        catalog_tier: 1,
        auction_tier: 1,
        auction_value: 20,
      }),
      player({
        id: "p2",
        position: "OF",
        positions: ["OF"],
        catalog_tier: 1,
        auction_tier: 1,
        auction_value: 18,
      }),
    ];
    const [tier1] = calculateTierStats(
      groupPlayersByTier(players),
      new Set(),
      leagueSlots,
    );
    expect(tier1.positionCounts).toEqual({ SS: 1, "3B": 1, OF: 2 });
  });
});

describe("buildTierViewForPosition", () => {
  it("recomputes tier stats when position filter is applied", () => {
    const players = [
      player({ id: "p1", position: "OF", auction_tier: 1, auction_value: 20 }),
      player({ id: "p2", position: "P", auction_tier: 1, auction_value: 18 }),
      player({ id: "p3", position: "OF", auction_tier: 2, auction_value: 8 }),
    ];
    const ofStats = buildTierViewForPosition(players, new Set(), "OF");
    expect(ofStats).toHaveLength(2);
    expect(ofStats[0].players.every((p) => p.position === "OF")).toBe(true);
    expect(ofStats[0].players).toHaveLength(1);
  });
});

describe("isDeemphasizedTier", () => {
  it("de-emphasizes min-bid style tiers", () => {
    const players = Array.from({ length: 8 }, (_, i) =>
      player({
        id: `p${i}`,
        auction_tier: 5,
        auction_value: 1,
        catalog_tier: 5,
      }),
    );
    const stat = calculateTierStats(groupPlayersByTier(players), new Set())[0];
    expect(stat.isMinBidStyleTier).toBe(true);
    expect(isDeemphasizedTier(stat)).toBe(true);
  });
});

describe("sortPlayersInTier", () => {
  it("sorts by auction rank ascending", () => {
    const players = [
      player({ id: "p1", auction_rank: 5, auction_value: 10 }),
      player({ id: "p2", auction_rank: 2, auction_value: 12 }),
    ];
    const sorted = sortPlayersInTier(players, "auction_rank");
    expect(sorted.map((p) => p.id)).toEqual(["p2", "p1"]);
  });
});

describe("partitionPlayersForTierView", () => {
  it("keeps drafted players in tiered pool without engine auction value", () => {
    const draftedIds = new Set(["sold"]);
    const players = [
      player({
        id: "sold",
        auction_tier: 1,
        valuation_eligible: false,
        auction_value: undefined as unknown as number,
      }),
      player({
        id: "out",
        valuation_eligible: false,
        catalog_tier: undefined as unknown as number,
      }),
    ];
    const { tiered, outsideModel } = partitionPlayersForTierView(
      players,
      draftedIds,
    );
    expect(tiered.map((p) => p.id)).toEqual(["sold"]);
    expect(outsideModel.map((p) => p.id)).toEqual(["out"]);
  });
});

describe("tierPlayerDisplayDollars", () => {
  it("prefers drafted price over engine value for drafted players", () => {
    const draftedIds = new Set(["sold"]);
    const p = player({
      id: "sold",
      auction_tier: 1,
      valuation_eligible: true,
      auction_value: 40,
    });
    const price = tierPlayerDisplayDollars(p, {
      draftedIds,
      draftedPriceByPlayerId: new Map([["sold", 16]]),
    });
    expect(price).toBe(16);
  });

  it("uses drafted price when engine value is missing", () => {
    const draftedIds = new Set(["sold"]);
    const p = player({
      id: "sold",
      auction_tier: 1,
      valuation_eligible: false,
      auction_value: undefined as unknown as number,
    });
    const price = tierPlayerDisplayDollars(p, {
      draftedIds,
      draftedPriceByPlayerId: new Map([["sold", 16]]),
    });
    expect(price).toBe(16);
  });
});

describe("splitTierPlayersByDraftStatus", () => {
  it("splits available and drafted within a tier", () => {
    const draftedIds = new Set(["b"]);
    const players = [
      player({ id: "a", auction_tier: 1, auction_value: 17 }),
      player({ id: "b", auction_tier: 1, auction_value: 15 }),
    ];
    const { available, drafted } = splitTierPlayersByDraftStatus(
      players,
      draftedIds,
    );
    expect(available.map((p) => p.id)).toEqual(["a"]);
    expect(drafted.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("buildFullTierView", () => {
  it("excludes drafted players from available left count", () => {
    const players = [
      player({ id: "a", auction_tier: 1, auction_value: 17 }),
      player({
        id: "b",
        auction_tier: 1,
        auction_value: 15,
      }),
    ];
    const { tiers } = buildFullTierView(
      players,
      new Set(["b"]),
      "all",
    );
    expect(tiers[0]!.availableCount).toBe(1);
    expect(tiers[0]!.draftedCount).toBe(1);
    expect(tiers[0]!.draftedPlayers.map((p) => p.id)).toEqual(["b"]);
    expect(tiers[0]!.availablePlayers.map((p) => p.id)).toEqual(["a"]);
  });

  it("computes value range and average from available players only", () => {
    const players = [
      player({ id: "a", auction_tier: 1, auction_value: 20 }),
      player({
        id: "b",
        auction_tier: 1,
        auction_value: 5,
        valuation_eligible: false,
      }),
    ];
    const { tiers } = buildFullTierView(players, new Set(["b"]), "all");
    expect(tiers[0]!.minValueDisplay).toBe(20);
    expect(tiers[0]!.maxValueDisplay).toBe(20);
    expect(tiers[0]!.averageValueRaw).toBe(20);
  });
});

describe("auditTierInputs", () => {
  it("returns diagnosis when lower tiers are min-bid shelves", () => {
    const players = [
      player({ id: "e1", auction_tier: 1, auction_value: 17 }),
      ...Array.from({ length: 6 }, (_, i) =>
        player({
          id: `d${i}`,
          auction_tier: 5,
          auction_value: 1,
          catalog_tier: 5,
        }),
      ),
    ];
    const { diagnosis } = auditTierInputs(players, new Set());
    expect(diagnosis).toMatch(/min-bid|de-emphasize/i);
  });
});
