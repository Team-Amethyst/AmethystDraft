import { describe, expect, it } from "vitest";
import { sortPlayerTableRows } from "./playerTableSort";
import type { Player } from "../types/player";

function player(
  id: string,
  overrides: Partial<Player> & Pick<Player, "name" | "adp" | "tier">,
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

  it("sorts by adp ascending", () => {
    const rows = [
      { player: player("a", { name: "A", adp: 50, tier: 1 }), isBatter: true, valDiff: 0 },
      { player: player("b", { name: "B", adp: 10, tier: 1 }), isBatter: true, valDiff: 0 },
    ];
    const out = sortPlayerTableRows(rows, { col: "adp", dir: "asc" }, batCols, pitCols, "recommended_bid", basis);
    expect(out.map((r) => r.player.id)).toEqual(["b", "a"]);
  });

  it("sorts by tier descending", () => {
    const rows = [
      { player: player("a", { name: "A", adp: 1, tier: 1 }), isBatter: true, valDiff: 0 },
      { player: player("b", { name: "B", adp: 2, tier: 3 }), isBatter: true, valDiff: 0 },
    ];
    const out = sortPlayerTableRows(rows, { col: "tier", dir: "desc" }, batCols, pitCols, "recommended_bid", basis);
    expect(out.map((r) => r.player.id)).toEqual(["b", "a"]);
  });
});
