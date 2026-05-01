import { describe, it, expect } from "vitest";
import { groupPlayersByTier, calculateTierStats } from "./tiers";

type Player = { id: string; mlbId?: number; name?: string; tier?: number; position?: string; recommended_bid?: number };

describe("groupPlayersByTier", () => {
  it("groups players by tier and sorts numeric tiers ascending with unassigned last", () => {
    const players = [
      { id: "p1", name: "A", tier: 2 },
      { id: "p2", name: "B", tier: 1 },
      { id: "p3", name: "C" },
      { id: "p4", name: "D", tier: 3 },
    ] as unknown as Player[];

    const groups = groupPlayersByTier(players as any);

    expect(groups.map((g) => g.tier)).toEqual([1, 2, 3, "unassigned"]);
    const counts = groups.map((g) => g.players.length);
    expect(counts).toEqual([1, 1, 1, 1]);
  });

  it("places players without tier in unassigned group", () => {
    const players = [
      { id: "pX", name: "MLB" },
    ] as unknown as Player[];

    const groups = groupPlayersByTier(players as any);
    expect(groups[0].tier).toBe("unassigned");
    expect(groups[0].players[0].id).toBe("pX");
  });
});

describe("calculateTierStats", () => {
  it("calculates position counts and value metrics per tier", () => {
    const players = [
      { id: "p1", name: "A", tier: 1, position: "SS", recommended_bid: 50 },
      { id: "p2", name: "B", tier: 1, position: "SS", recommended_bid: 48 },
      { id: "p3", name: "C", tier: 2, position: "C", recommended_bid: 30 },
    ] as unknown as Player[];

    const groups = groupPlayersByTier(players as any);
    const draftedIds = new Set<string>();
    const stats = calculateTierStats(groups, draftedIds);

    expect(stats[0].positionCounts["SS"]).toBe(2);
    expect(stats[0].averageValue).toBe(49);
    expect(stats[0].availableCount).toBe(2);
    expect(stats[0].draftedCount).toBe(0);
  });

  it("tracks drafted players and calculates value cliff", () => {
    const players = [
      { id: "p1", tier: 1, position: "SS", recommended_bid: 50 },
      { id: "p2", tier: 2, position: "SS", recommended_bid: 30 },
    ] as unknown as Player[];

    const groups = groupPlayersByTier(players as any);
    const draftedIds = new Set(["p1"]);
    const stats = calculateTierStats(groups, draftedIds);

    expect(stats[0].draftedCount).toBe(1);
    expect(stats[0].availableCount).toBe(0);
    expect(stats[1].valueCliffFromPrevious).toBe(20);
  });
});
