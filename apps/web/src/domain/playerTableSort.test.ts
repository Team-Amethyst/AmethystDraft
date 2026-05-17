import { describe, expect, it } from "vitest";
import { sortPlayerTableRows } from "./playerTableSort";
import type { Player } from "../types/player";

function player(
  id: string,
  overrides: Partial<Player> &
    Pick<Player, "name" | "catalog_rank" | "catalog_tier">,
): Player {
  return {
    id,
    mlbId: Number(id) || 1,
    team: "TST",
    position: "OF",
    age: 28,
    value: 1,
    headshot: "",
    stats: {} as Player["stats"],
    projection: {} as Player["projection"],
    ...overrides,
  } as Player;
}

describe("sortPlayerTableRows", () => {
  const batCols = ["AVG", "HR"];
  const pitCols = ["ERA", "K"];
  const basis = "projections" as const;

  it("sorts by catalog rank ascending", () => {
    const rows = [
      {
        player: player("a", { name: "A", catalog_rank: 50, catalog_tier: 1 }),
        isBatter: true,
        tags: [],
      },
      {
        player: player("b", { name: "B", catalog_rank: 10, catalog_tier: 1 }),
        isBatter: true,
        tags: [],
      },
    ];
    const out = sortPlayerTableRows(
      rows,
      { col: "catalog_rank", dir: "asc" },
      batCols,
      pitCols,
      "recommended_bid",
      basis,
    );
    expect(out.map((r) => r.player.id)).toEqual(["b", "a"]);
  });

  it("sorts by tier descending", () => {
    const rows = [
      {
        player: player("a", { name: "A", catalog_rank: 1, catalog_tier: 1 }),
        isBatter: true,
        tags: [],
      },
      {
        player: player("b", { name: "B", catalog_rank: 2, catalog_tier: 3 }),
        isBatter: true,
        tags: [],
      },
    ];
    const out = sortPlayerTableRows(
      rows,
      { col: "tier", dir: "desc" },
      batCols,
      pitCols,
      "recommended_bid",
      basis,
    );
    expect(out.map((r) => r.player.id)).toEqual(["b", "a"]);
  });

  it("sorts by value column using league-wide auction dollars", () => {
    const rows = [
      {
        player: player("a", {
          name: "A",
          catalog_rank: 1,
          catalog_tier: 1,
          auction_value: 10,
        }),
        isBatter: true,
        tags: [],
      },
      {
        player: player("b", {
          name: "B",
          catalog_rank: 2,
          catalog_tier: 1,
          auction_value: 50,
        }),
        isBatter: true,
        tags: [],
      },
    ];
    const out = sortPlayerTableRows(
      rows,
      { col: "value", dir: "desc" },
      batCols,
      pitCols,
      "auction_value",
      basis,
    );
    expect(out.map((r) => r.player.id)).toEqual(["b", "a"]);
  });

  it("sorts drafted players by price paid when research auction context is set", () => {
    const rows = [
      {
        player: player("sold", {
          name: "Sold",
          catalog_rank: 1,
          catalog_tier: 1,
          auction_value: 5,
          valuation_eligible: false,
        }),
        isBatter: true,
        tags: [],
      },
      {
        player: player("free", {
          name: "Free",
          catalog_rank: 2,
          catalog_tier: 1,
          auction_value: 20,
        }),
        isBatter: true,
        tags: [],
      },
    ];
    const out = sortPlayerTableRows(
      rows,
      { col: "value", dir: "desc" },
      batCols,
      pitCols,
      "auction_value",
      basis,
      {
        draftedIds: new Set(["sold"]),
        draftedPriceByPlayerId: new Map([["sold", 30]]),
      },
    );
    expect(out.map((r) => r.player.id)).toEqual(["sold", "free"]);
  });

  it("sorts by market ADP ascending (missing last)", () => {
    const rows = [
      {
        player: player("a", {
          name: "A",
          catalog_rank: 1,
          catalog_tier: 1,
          market_adp: 5,
        }),
        isBatter: true,
        tags: [],
      },
      {
        player: player("b", {
          name: "B",
          catalog_rank: 2,
          catalog_tier: 1,
          market_adp: 20,
        }),
        isBatter: true,
        tags: [],
      },
      {
        player: player("c", {
          name: "C",
          catalog_rank: 3,
          catalog_tier: 1,
        }),
        isBatter: true,
        tags: [],
      },
    ];
    const out = sortPlayerTableRows(
      rows,
      { col: "market_adp", dir: "asc" },
      batCols,
      pitCols,
      "auction_value",
      basis,
    );
    expect(out.map((r) => r.player.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by market ADP descending (missing still last)", () => {
    const rows = [
      {
        player: player("a", {
          name: "A",
          catalog_rank: 1,
          catalog_tier: 1,
          market_adp: 5,
        }),
        isBatter: true,
        tags: [],
      },
      {
        player: player("b", {
          name: "B",
          catalog_rank: 2,
          catalog_tier: 1,
          market_adp: 20,
        }),
        isBatter: true,
        tags: [],
      },
      {
        player: player("c", {
          name: "C",
          catalog_rank: 3,
          catalog_tier: 1,
        }),
        isBatter: true,
        tags: [],
      },
    ];
    const out = sortPlayerTableRows(
      rows,
      { col: "market_adp", dir: "desc" },
      batCols,
      pitCols,
      "auction_value",
      basis,
    );
    expect(out.map((r) => r.player.id)).toEqual(["b", "a", "c"]);
  });

  it("sorts by auction rank ascending (missing last)", () => {
    const rows = [
      {
        player: player("a", {
          name: "A",
          catalog_rank: 1,
          catalog_tier: 1,
          auction_rank: 3,
        }),
        isBatter: true,
        tags: [],
      },
      {
        player: player("b", {
          name: "B",
          catalog_rank: 2,
          catalog_tier: 1,
          auction_rank: 12,
        }),
        isBatter: true,
        tags: [],
      },
      {
        player: player("c", {
          name: "C",
          catalog_rank: 3,
          catalog_tier: 1,
        }),
        isBatter: true,
        tags: [],
      },
    ];
    const out = sortPlayerTableRows(
      rows,
      { col: "auction_rank", dir: "asc" },
      batCols,
      pitCols,
      "auction_value",
      basis,
    );
    expect(out.map((r) => r.player.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by auction rank descending (missing still last)", () => {
    const rows = [
      {
        player: player("a", {
          name: "A",
          catalog_rank: 1,
          catalog_tier: 1,
          auction_rank: 3,
        }),
        isBatter: true,
        tags: [],
      },
      {
        player: player("b", {
          name: "B",
          catalog_rank: 2,
          catalog_tier: 1,
          auction_rank: 12,
        }),
        isBatter: true,
        tags: [],
      },
      {
        player: player("c", {
          name: "C",
          catalog_rank: 3,
          catalog_tier: 1,
        }),
        isBatter: true,
        tags: [],
      },
    ];
    const out = sortPlayerTableRows(
      rows,
      { col: "auction_rank", dir: "desc" },
      batCols,
      pitCols,
      "auction_value",
      basis,
    );
    expect(out.map((r) => r.player.id)).toEqual(["b", "a", "c"]);
  });

  it("treats legacy adp sort key as catalog rank", () => {
    const rows = [
      {
        player: player("a", { name: "A", catalog_rank: 50, catalog_tier: 1 }),
        isBatter: true,
        tags: [],
      },
      {
        player: player("b", { name: "B", catalog_rank: 10, catalog_tier: 1 }),
        isBatter: true,
        tags: [],
      },
    ];
    const out = sortPlayerTableRows(
      rows,
      { col: "adp", dir: "asc" },
      batCols,
      pitCols,
      "auction_value",
      basis,
    );
    expect(out.map((r) => r.player.id)).toEqual(["b", "a"]);
  });
});
