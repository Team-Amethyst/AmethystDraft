import { describe, expect, it } from "vitest";
import type { Player } from "../../types/player";
import type { RosterEntry } from "../../api/roster";
import {
  computePositionMarket,
  playerEligibleForMarketSlot,
  rosterSlotMatchesMarketTab,
} from "./market";

const sp: Player = {
  id: "sp1",
  mlbId: 1,
  name: "Starter",
  team: "NYY",
  position: "SP",
  positions: ["SP"],
  age: 28,
  catalog_rank: 1,
  catalog_tier: 1,
  value: 30,
  auction_value: 30,
  headshot: "",
  stats: {},
  projection: {},
  outlook: "",
};

const dh: Player = {
  ...sp,
  id: "dh1",
  name: "Hitter",
  position: "DH",
  positions: ["DH", "1B"],
};

describe("command center market slot helpers", () => {
  it("P market tab matches SP and RP roster slots", () => {
    expect(rosterSlotMatchesMarketTab("P", "SP")).toBe(true);
    expect(rosterSlotMatchesMarketTab("P", "RP")).toBe(true);
    expect(rosterSlotMatchesMarketTab("SP", "RP")).toBe(false);
  });

  it("playerEligibleForMarketSlot uses roster slot rules", () => {
    expect(playerEligibleForMarketSlot(sp, "P")).toBe(true);
    expect(playerEligibleForMarketSlot(sp, "SP")).toBe(true);
    expect(playerEligibleForMarketSlot(dh, "1B")).toBe(true);
  });
});

describe("computePositionMarket", () => {
  it("aggregates P market across SP-eligible arms", () => {
    const rp: Player = { ...sp, id: "rp1", position: "RP", positions: ["RP"] };
    const all = [sp, rp];
    const market = computePositionMarket("P", all, new Set(), [], undefined);
    expect(market?.position).toBe("P");
    expect(market?.supply.reduce((s, r) => s + r.count, 0)).toBe(2);
    expect(market?.supply).toHaveLength(5);
  });

  it("buckets remaining players by auction value band, not Engine tier", () => {
    const elite: Player = {
      ...sp,
      id: "elite",
      auction_value: 27,
      auction_tier: 5,
    };
    const mid: Player = {
      ...sp,
      id: "mid",
      auction_value: 16,
      auction_tier: 1,
    };
    const market = computePositionMarket("SP", [elite, mid], new Set(), [], undefined);
    const t1 = market?.supply.find((r) => r.tier === 1);
    const t2 = market?.supply.find((r) => r.tier === 2);
    expect(t1?.count).toBe(1);
    expect(t2?.count).toBe(1);
  });

  it("buckets by Engine auction_value when catalog rows lack auction_value", () => {
    const elite: Player = {
      ...sp,
      id: "elite",
      auction_value: undefined as unknown as number,
      value: 99,
      auction_tier: 5,
    };
    const mid: Player = {
      ...sp,
      id: "mid",
      auction_value: undefined as unknown as number,
      value: 50,
      auction_tier: 1,
    };
    const overrides = new Map([
      ["elite", { tier: 5, value: 27 }],
      ["mid", { tier: 1, value: 16 }],
    ]);
    const market = computePositionMarket(
      "SP",
      [elite, mid],
      new Set(),
      [],
      overrides,
    );
    expect(market?.supply.find((r) => r.tier === 1)?.count).toBe(1);
    expect(market?.supply.find((r) => r.tier === 2)?.count).toBe(1);
    expect(market?.avgProjValue).toBeGreaterThan(0);
  });

  it("scales value-tier buckets with league budget", () => {
    const atT1: Player = {
      ...sp,
      id: "star",
      auction_value: 50,
      auction_tier: 5,
    };
    const atT2: Player = {
      ...sp,
      id: "solid",
      auction_value: 49,
      auction_tier: 1,
    };
    const market = computePositionMarket(
      "SP",
      [atT1, atT2],
      new Set(),
      [],
      undefined,
      520,
    );
    expect(market?.supply.find((r) => r.tier === 1)?.count).toBe(1);
    expect(market?.supply.find((r) => r.tier === 2)?.count).toBe(1);
  });

  it("counts drafted picks by roster slot for P market", () => {
    const entries: RosterEntry[] = [
      {
        _id: "e1",
        externalPlayerId: "sp1",
        playerName: "Starter",
        price: 40,
        rosterSlot: "SP",
        teamId: "team_1",
      } as RosterEntry,
    ];
    const market = computePositionMarket(
      "P",
      [sp],
      new Set(["sp1"]),
      entries,
      undefined,
    );
    expect(market?.avgWinPrice).toBe(40);
  });
});
