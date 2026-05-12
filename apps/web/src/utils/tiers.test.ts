import { describe, it, expect } from "vitest";
import type { Player } from "../types/player";
import { groupPlayersByTier, calculateTierStats } from "./tiers";

describe("groupPlayersByTier", () => {
  it("groups players by tier and sorts numeric tiers ascending with unassigned last", () => {
    const players = [
      { id: "p1", name: "A", catalog_tier: 2 },
      { id: "p2", name: "B", catalog_tier: 1 },
      { id: "p3", name: "C" },
      { id: "p4", name: "D", catalog_tier: 3 },
    ] as unknown as Player[];

    const groups = groupPlayersByTier(players as unknown as Player[]);

    expect(groups.map((g) => g.tier)).toEqual([1, 2, 3, "unassigned"]);
    const counts = groups.map((g) => g.players.length);
    expect(counts).toEqual([1, 1, 1, 1]);
  });

  it("places players without tier in unassigned group", () => {
    const players = [
      { id: "pX", name: "MLB" },
    ] as unknown as Player[];

    const groups = groupPlayersByTier(players as unknown as Player[]);
    expect(groups[0].tier).toBe("unassigned");
    expect(groups[0].players[0].id).toBe("pX");
  });
});

describe("calculateTierStats", () => {
  it("calculates position counts and value metrics per tier", () => {
    const players = [
      {
        id: "p1",
        name: "A",
        catalog_tier: 1,
        position: "SS",
        recommended_bid: 50,
      },
      {
        id: "p2",
        name: "B",
        catalog_tier: 1,
        position: "SS",
        recommended_bid: 48,
      },
      {
        id: "p3",
        name: "C",
        catalog_tier: 2,
        position: "C",
        recommended_bid: 30,
      },
    ] as unknown as Player[];

    const groups = groupPlayersByTier(players as unknown as Player[]);
    const draftedIds = new Set<string>();
    const stats = calculateTierStats(groups, draftedIds);

    expect(stats[0].positionCounts["SS"]).toBe(2);
    expect(stats[0].averageValue).toBe(49);
    expect(stats[0].availableCount).toBe(2);
    expect(stats[0].draftedCount).toBe(0);
  });

  it("tracks drafted players and calculates value cliff", () => {
    const players = [
      {
        id: "p1",
        catalog_tier: 1,
        position: "SS",
        recommended_bid: 50,
      },
      {
        id: "p2",
        catalog_tier: 2,
        position: "SS",
        recommended_bid: 30,
      },
    ] as unknown as Player[];

    const groups = groupPlayersByTier(players as unknown as Player[]);
    const draftedIds = new Set(["p1"]);
    const stats = calculateTierStats(groups, draftedIds);

    expect(stats[0].draftedCount).toBe(1);
    expect(stats[0].availableCount).toBe(0);
    expect(stats[1].valueCliffFromPrevious).toBe(20);
  });
});
