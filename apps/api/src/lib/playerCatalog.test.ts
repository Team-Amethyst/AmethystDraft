import { describe, expect, it } from "vitest";
import {
  applyAdpByValue,
  filterByPlayerPool,
  mergeTwoWayPlayers,
  sortPlayers,
  type PlayerData,
} from "./playerCatalog";

function makePlayer(overrides: Partial<PlayerData>): PlayerData {
  return {
    id: "1",
    mlbId: 1,
    name: "Test Player",
    team: "LAD",
    position: "OF",
    positions: ["OF"],
    age: 27,
    adp: 0,
    value: 10,
    tier: 3,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
    ...overrides,
  };
}

describe("mergeTwoWayPlayers", () => {
  it("merges duplicate ids and unions positions", () => {
    const hitter = makePlayer({
      id: "42",
      name: "Shohei Ohtani",
      position: "DH",
      positions: ["DH"],
      value: 35,
      stats: { batting: { avg: ".280", hr: 35, rbi: 95, runs: 100, sb: 20, obp: ".370", slg: ".550" } },
    });
    const pitcher = makePlayer({
      id: "42",
      name: "Shohei Ohtani",
      position: "SP",
      positions: ["SP"],
      value: 40,
      stats: { pitching: { era: "3.20", whip: "1.08", wins: 12, saves: 0, holds: 0, strikeouts: 180, innings: "160", completeGames: 1 } },
    });

    const merged = mergeTwoWayPlayers([hitter, pitcher]);

    expect(merged).toHaveLength(1);
    const mergedPlayer = merged[0];
    expect(mergedPlayer).toBeDefined();
    expect(mergedPlayer?.positions.sort()).toEqual(["DH", "SP"]);
    expect(mergedPlayer?.position).toBe("SP");
    expect(mergedPlayer?.stats.batting).toBeDefined();
    expect(mergedPlayer?.stats.pitching).toBeDefined();
  });
});

describe("filterByPlayerPool", () => {
  const players = [
    makePlayer({ id: "1", team: "NYY" }),
    makePlayer({ id: "2", team: "LAD" }),
  ];

  it("filters AL leagues", () => {
    expect(filterByPlayerPool(players, "AL").map((p) => p.id)).toEqual(["1"]);
  });

  it("filters NL leagues", () => {
    expect(filterByPlayerPool(players, "NL").map((p) => p.id)).toEqual(["2"]);
  });
});

describe("applyAdpByValue and sortPlayers", () => {
  const players = [
    makePlayer({ id: "a", name: "B", value: 20 }),
    makePlayer({ id: "b", name: "A", value: 30 }),
  ];

  it("assigns adp based on descending value", () => {
    const withAdp = applyAdpByValue(players);
    expect(withAdp.find((p) => p.id === "b")?.adp).toBe(1);
    expect(withAdp.find((p) => p.id === "a")?.adp).toBe(2);
  });

  it("sorts by name when requested", () => {
    const sorted = sortPlayers(players, "name");
    expect(sorted.map((p) => p.name)).toEqual(["A", "B"]);
  });
});
