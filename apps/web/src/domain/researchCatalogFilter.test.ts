import { describe, expect, it } from "vitest";
import {
  filterResearchCatalogPlayers,
  filterResearchDefaultCatalogKind,
} from "./researchCatalogFilter";
import type { Player } from "../types/player";

function minimalPlayer(
  overrides: Partial<Player> & Pick<Player, "id" | "name" | "position">,
): Player {
  return {
    mlbId: 1,
    team: "TST",
    positions: overrides.positions ?? [overrides.position],
    age: 28,
    catalog_rank: 100,
    value: 1,
    catalog_tier: 3,
    catalog_kind: "valuation_eligible",
    valuation_eligible: true,
    headshot: "",
    stats: {} as Player["stats"],
    projection: {} as Player["projection"],
    outlook: "",
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

describe("filterResearchDefaultCatalogKind", () => {
  it("removes roster_context rows by default", () => {
    const rows: Player[] = [
      minimalPlayer({ id: "1", name: "A", position: "OF", catalog_kind: "valuation_eligible" }),
      minimalPlayer({
        id: "2",
        name: "B",
        position: "RP",
        catalog_kind: "roster_context",
        valuation_eligible: false,
      }),
      minimalPlayer({
        id: "3",
        name: "C",
        position: "SP",
        catalog_kind: "market_only",
        valuation_eligible: false,
        market_adp: 200,
      }),
    ];
    const out = filterResearchDefaultCatalogKind(rows);
    expect(out.map((p) => p.id).sort()).toEqual(["1", "3"]);
  });

  it("hides market_only rows without finite Market ADP", () => {
    const rows: Player[] = [
      minimalPlayer({
        id: "1",
        name: "Has ADP",
        position: "SP",
        catalog_kind: "market_only",
        valuation_eligible: false,
        market_adp: 42,
      }),
      minimalPlayer({
        id: "2",
        name: "No ADP",
        position: "SP",
        catalog_kind: "market_only",
        valuation_eligible: false,
      }),
      minimalPlayer({
        id: "3",
        name: "NaN ADP",
        position: "SP",
        catalog_kind: "market_only",
        valuation_eligible: false,
        market_adp: Number.NaN,
      }),
    ];
    const out = filterResearchDefaultCatalogKind(rows);
    expect(out.map((p) => p.id)).toEqual(["1"]);
  });

  it("keeps valuation_eligible rows unchanged by catalog filter", () => {
    const rows: Player[] = [
      minimalPlayer({
        id: "10",
        name: "Star",
        position: "OF",
        catalog_kind: "valuation_eligible",
        valuation_eligible: true,
        market_adp: undefined,
      }),
    ];
    expect(filterResearchDefaultCatalogKind(rows)).toEqual(rows);
  });

  it("shows legacy rows when catalog_kind is omitted (treated as valuation_eligible in normalize)", () => {
    const rows: Player[] = [
      minimalPlayer({
        id: "legacy",
        name: "Legacy",
        position: "C",
        catalog_kind: undefined,
        valuation_eligible: undefined,
      }),
    ];
    expect(filterResearchDefaultCatalogKind(rows)).toEqual(rows);
  });
});
