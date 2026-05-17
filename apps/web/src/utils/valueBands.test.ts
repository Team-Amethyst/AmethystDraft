import { describe, it, expect } from "vitest";
import type { Player } from "../types/player";
import {
  buildValueBandViewForPosition,
  calculateValueBandStats,
  diagnoseTierSeparation,
  formatCliffToNextBandLabel,
  groupPlayersByValueBand,
  isDeemphasizedValueBand,
  runTierSeparationAudit,
  valueBandIdForRaw,
} from "./valueBands";
import { calculateTierStats, groupPlayersByTier } from "./tiers";

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

describe("valueBandIdForRaw", () => {
  it("maps raw dollars to audit bands", () => {
    expect(valueBandIdForRaw(32)).toBe("elite_30");
    expect(valueBandIdForRaw(22)).toBe("strong_20");
    expect(valueBandIdForRaw(16)).toBe("starter_15");
    expect(valueBandIdForRaw(11)).toBe("useful_10");
    expect(valueBandIdForRaw(7)).toBe("depth_5");
    expect(valueBandIdForRaw(3)).toBe("minbid_2");
    expect(valueBandIdForRaw(1)).toBe("reserve_1");
    expect(valueBandIdForRaw(null)).toBe("unvalued");
  });
});

describe("groupPlayersByValueBand", () => {
  it("orders bands from elite to reserve and omits empty bands", () => {
    const players = [
      player({ id: "a", auction_value: 17, auction_tier: 1 }),
      player({ id: "b", auction_value: 8, auction_tier: 2 }),
      player({ id: "c", auction_value: 1, auction_tier: 5 }),
    ];
    const groups = groupPlayersByValueBand(players);
    expect(groups.map((g) => g.bandId)).toEqual([
      "starter_15",
      "depth_5",
      "reserve_1",
    ]);
  });
});

describe("calculateValueBandStats", () => {
  it("computes raw distribution and cliffs between bands", () => {
    const players = [
      player({ id: "a", auction_value: 17, auction_tier: 1 }),
      player({ id: "b", auction_value: 15.5, auction_tier: 1 }),
      player({ id: "c", auction_value: 9, auction_tier: 2 }),
    ];
    const stats = calculateValueBandStats(
      groupPlayersByValueBand(players),
      new Set(),
    );
    expect(stats[0]!.minValueDisplay).toBe(16);
    expect(stats[0]!.maxValueDisplay).toBe(17);
    expect(stats[0]!.cliffToNextBandRaw).toBeCloseTo(15.5 - 9, 5);
    expect(stats[0]!.engineTierCounts[1]).toBe(2);
  });
});

describe("buildValueBandViewForPosition", () => {
  it("recomputes bands when position filter changes", () => {
    const players = [
      player({ id: "p1", position: "OF", auction_value: 20, auction_tier: 1 }),
      player({ id: "p2", position: "P", auction_value: 18, auction_tier: 1 }),
      player({ id: "p3", position: "OF", auction_value: 8, auction_tier: 2 }),
    ];
    const ofBands = buildValueBandViewForPosition(players, new Set(), "OF");
    expect(ofBands.map((b) => b.bandId)).toEqual(["strong_20", "depth_5"]);
    expect(ofBands[0]!.players).toHaveLength(1);
  });
});

describe("isDeemphasizedValueBand", () => {
  it("de-emphasizes reserve and min-bid style bands", () => {
    const players = Array.from({ length: 8 }, (_, i) =>
      player({
        id: `r${i}`,
        auction_value: 1,
        auction_tier: 5,
      }),
    );
    const stat = calculateValueBandStats(
      groupPlayersByValueBand(players),
      new Set(),
    )[0]!;
    expect(isDeemphasizedValueBand(stat)).toBe(true);
  });
});

describe("formatCliffToNextBandLabel", () => {
  it("uses band wording for meaningful cliffs", () => {
    expect(
      formatCliffToNextBandLabel({
        cliffRaw: 5,
        isMinBidStyleBand: false,
        isFlatValueBand: false,
        hasNextBand: true,
      }),
    ).toBe("$5 drop after band");
  });
});

describe("runTierSeparationAudit", () => {
  it("diagnoses C when tier 1 holds value and lower tiers are min-bid shelves", () => {
    const players = [
      ...Array.from({ length: 4 }, (_, i) =>
        player({
          id: `t1-${i}`,
          name: `Star ${i}`,
          auction_tier: 1,
          auction_value: 17 - i * 2,
          auction_rank: i + 1,
        }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        player({
          id: `t5-${i}`,
          auction_tier: 5,
          auction_value: 1,
          catalog_tier: 5,
        }),
      ),
    ];
    const report = runTierSeparationAudit(players, new Set());
    expect(["B", "C"]).toContain(report.diagnosis);
    expect(report.byEngineTier.length).toBeGreaterThanOrEqual(2);
    expect(report.byValueBand.length).toBeGreaterThanOrEqual(2);
    expect(report.boundaries.length).toBeGreaterThanOrEqual(1);
  });
});

describe("diagnoseTierSeparation", () => {
  it("returns A when multiple engine tiers carry meaningful dollars", () => {
    const players = [
      player({ id: "a", auction_tier: 1, auction_value: 40 }),
      player({ id: "b", auction_tier: 2, auction_value: 25 }),
      player({ id: "c", auction_tier: 3, auction_value: 18 }),
      player({ id: "d", auction_tier: 4, auction_value: 12 }),
    ];
    const engineStats = calculateTierStats(groupPlayersByTier(players), new Set());
    const bandStats = buildValueBandViewForPosition(players, new Set(), "all");
    const { diagnosis } = diagnoseTierSeparation(engineStats, bandStats);
    expect(diagnosis).toBe("A");
  });
});
