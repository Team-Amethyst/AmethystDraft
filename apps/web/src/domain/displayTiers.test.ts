import { describe, expect, it } from "vitest";
import type { Player } from "../types/player";
import { buildFullTierView, groupPlayersByEngineTier } from "../utils/tiers";
import {
  displayTierForRaw,
  displayTierGroupingRaw,
  groupPlayersByDisplayTier,
  shouldShowEngineTierMetadata,
} from "./displayTiers";

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

describe("displayTierForRaw", () => {
  it("maps fixed auction bands to T1–T5", () => {
    expect(displayTierForRaw(27)).toBe(1);
    expect(displayTierForRaw(25)).toBe(1);
    expect(displayTierForRaw(24)).toBe(2);
    expect(displayTierForRaw(15)).toBe(2);
    expect(displayTierForRaw(14)).toBe(3);
    expect(displayTierForRaw(10)).toBe(3);
    expect(displayTierForRaw(9)).toBe(4);
    expect(displayTierForRaw(5)).toBe(4);
    expect(displayTierForRaw(4)).toBe(5);
    expect(displayTierForRaw(1)).toBe(5);
  });
});

describe("groupPlayersByDisplayTier", () => {
  it("separates wide Engine T1 into distinct display tiers", () => {
    const players = [
      player({ id: "elite", auction_tier: 1, auction_value: 27 }),
      player({ id: "depth", auction_tier: 1, auction_value: 4 }),
    ];
    const groups = groupPlayersByDisplayTier(players);
    expect(groups.map((g) => g.tier)).toEqual([1, 5]);
    expect(groups[0]!.players.map((p) => p.id)).toEqual(["elite"]);
    expect(groups[1]!.players.map((p) => p.id)).toEqual(["depth"]);
  });

  it("places drafted players without model value using price paid", () => {
    const sold = player({
      id: "sold",
      auction_tier: 1,
      valuation_eligible: false,
      auction_value: undefined as unknown as number,
    });
    const tier = displayTierGroupingRaw(sold, {
      draftedIds: new Set(["sold"]),
      draftedPriceByPlayerId: new Map([["sold", 16]]),
    });
    expect(tier).toBe(2);
  });
});

describe("buildFullTierView display tiers", () => {
  it("does not put $27 and $4 available players in the same tier", () => {
    const players = [
      player({ id: "hi", auction_tier: 1, auction_value: 27 }),
      player({ id: "lo", auction_tier: 1, auction_value: 4 }),
    ];
    const { tiers } = buildFullTierView(players, new Set(), "all");
    expect(tiers).toHaveLength(2);
    expect(tiers[0]!.tier).toBe(1);
    expect(tiers[0]!.availablePlayers.map((p) => p.id)).toEqual(["hi"]);
    expect(tiers[1]!.tier).toBe(5);
    expect(tiers[1]!.availablePlayers.map((p) => p.id)).toEqual(["lo"]);
    expect(tiers[0]!.maxValueDisplay).toBeLessThanOrEqual(27);
    expect(tiers[0]!.minValueDisplay).toBeGreaterThanOrEqual(25);
  });

  it("collapses min-bid Engine T2–T5 into display T5 instead of separate shelves", () => {
    const players = [
      player({ id: "e1", auction_tier: 1, auction_value: 27 }),
      ...Array.from({ length: 8 }, (_, i) =>
        player({
          id: `mb-${i}`,
          auction_tier: 2,
          auction_value: 1,
        }),
      ),
    ];
    const view = buildFullTierView(players, new Set(), "all");
    const byEngine = groupPlayersByEngineTier(players);
    expect(byEngine.find((g) => g.tier === 2)!.players.length).toBe(8);
    expect(view.tiers.map((t) => t.tier)).toEqual([1, 5]);
    expect(view.tiers.find((t) => t.tier === 5)!.players.length).toBe(8);
  });
});

describe("shouldShowEngineTierMetadata", () => {
  it("is true when Engine tier differs from display tier", () => {
    const p = player({ id: "x", auction_tier: 1, auction_value: 4 });
    expect(shouldShowEngineTierMetadata(p, 5)).toBe(true);
    expect(
      shouldShowEngineTierMetadata(
        player({ id: "y", auction_tier: 1, auction_value: 27 }),
        1,
      ),
    ).toBe(false);
  });
});
