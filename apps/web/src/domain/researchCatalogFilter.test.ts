import { describe, expect, it } from "vitest";
import { filterResearchCatalogPlayers } from "./researchCatalogFilter";
import type { Player } from "../types/player";

function minimalPlayer(
  overrides: Partial<Player> & Pick<Player, "id" | "name" | "position">,
): Player {
  return {
    mlbId: 1,
    team: "TST",
    positions: overrides.positions ?? [overrides.position],
    age: 28,
    adp: 100,
    value: 1,
    tier: 3,
    headshot: "",
    stats: {} as Player["stats"],
    projection: {} as Player["projection"],
    ...overrides,
  } as Player;
}

describe("filterResearchCatalogPlayers", () => {
  const players = [
    minimalPlayer({
      id: "1",
      name: "Aaron Judge",
      position: "OF",
      positions: ["OF"],
    }),
    minimalPlayer({
      id: "2",
      name: "Gerrit Cole",
      position: "P",
      positions: ["P"],
    }),
    minimalPlayer({
      id: "3",
      name: "Shohei Ohtani",
      position: "DH",
      positions: ["DH", "P"],
    }),
  ];

  it("filters by name substring", () => {
    expect(filterResearchCatalogPlayers(players, "judge", "all").map((p) => p.id)).toEqual(
      ["1"],
    );
  });

  it("filters pitchers when position P", () => {
    const r = filterResearchCatalogPlayers(players, "", "P");
    expect(r.map((p) => p.id).sort()).toEqual(["2", "3"]);
  });

  it("filters OF eligibility", () => {
    const r = filterResearchCatalogPlayers(players, "", "OF");
    expect(r.map((p) => p.id).sort()).toEqual(["1"]);
  });
});
