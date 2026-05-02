import { describe, expect, it } from "vitest";
import { searchRankedAvailablePlayers } from "./auctionPlayerSearch";
import type { Player } from "../types/player";

function p(
  id: string,
  name: string,
  adp: number,
  overrides: Partial<Player> = {},
): Player {
  return {
    id,
    name,
    team: "TST",
    position: "OF",
    positions: ["OF"],
    tier: 1,
    value: 10,
    adp,
    ...overrides,
  } as Player;
}

describe("searchRankedAvailablePlayers", () => {
  const drafted = new Set<string>(["d1"]);
  const players = [
    p("a", "Aaron Judge", 5),
    p("b", "Judge Judy", 50),
    p("c", "Ja Judge", 12),
    p("d1", "Drafted Guy", 3),
  ];

  it("returns empty for short query", () => {
    expect(searchRankedAvailablePlayers(players, drafted, "", { limit: 8 })).toEqual(
      [],
    );
  });

  it("prefers full-name prefix over token-only prefix, then ADP", () => {
    const r = searchRankedAvailablePlayers(players, drafted, "judge", { limit: 8 });
    expect(r[0]?.name).toBe("Judge Judy");
    const r2 = searchRankedAvailablePlayers(players, drafted, "aaron", { limit: 8 });
    expect(r2[0]?.name).toBe("Aaron Judge");
  });

  it("excludes drafted ids", () => {
    const r = searchRankedAvailablePlayers(players, drafted, "guy", { limit: 8 });
    expect(r.map((x) => x.id)).not.toContain("d1");
  });
});
