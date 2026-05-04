import { describe, expect, it } from "vitest";
import {
  addPlayerToTaxiRoster,
  getEligibleTaxiPlayers,
  getTaxiRosterPlayerIds,
  initializeTaxiDraftOrder,
  moveTaxiDraftOrderTeamDown,
  moveTaxiDraftOrderTeamUp,
  removePlayerFromTaxiRoster,
  replaceTaxiRosterPlayer,
  searchEligibleTaxiPlayers,
} from "./taxiDraft";
import type { TaxiRosters } from "../types/taxiDraft";
import type { Player } from "../types/player";

const samplePlayers: Player[] = [
  { id: "p1", mlbId: 1, name: "Alpha", team: "ATL", position: "1B", age: 25, adp: 10, value: 50, tier: 1, headshot: "", stats: {}, projection: {}, outlook: "" },
  { id: "p2", mlbId: 2, name: "Bravo", team: "BOS", position: "2B", age: 26, adp: 20, value: 40, tier: 2, headshot: "", stats: {}, projection: {}, outlook: "" },
  { id: "p3", mlbId: 3, name: "Charlie", team: "CHC", position: "3B", age: 27, adp: 30, value: 30, tier: 3, headshot: "", stats: {}, projection: {}, outlook: "" },
];

const sampleRosters: TaxiRosters = {
  teamA: [
    { playerId: "p1", teamId: "teamA", addedAt: "2026-01-01T00:00:00.000Z", pickNumber: 1 },
  ],
  teamB: [
    { playerId: "p2", teamId: "teamB", addedAt: "2026-01-01T00:00:00.000Z", pickNumber: 2 },
  ],
};

describe("taxiDraft helpers", () => {
  it("initializes order immutably", () => {
    const input = ["teamA", "teamB", "teamC"];
    const output = initializeTaxiDraftOrder(input);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });

  it("moves teams up and down in order", () => {
    const order = ["teamA", "teamB", "teamC"];
    expect(moveTaxiDraftOrderTeamUp(order, "teamB")).toEqual(["teamB", "teamA", "teamC"]);
    expect(moveTaxiDraftOrderTeamUp(order, "teamA")).toEqual(order);
    expect(moveTaxiDraftOrderTeamDown(order, "teamB")).toEqual(["teamA", "teamC", "teamB"]);
    expect(moveTaxiDraftOrderTeamDown(order, "teamC")).toEqual(order);
  });

  it("returns a deduplicated list of taxi roster player ids", () => {
    const rosters: TaxiRosters = {
      teamA: [
        { playerId: "p1", teamId: "teamA", addedAt: "x" },
      ],
      teamB: [
        { playerId: "p1", teamId: "teamB", addedAt: "y" },
        { playerId: "p2", teamId: "teamB", addedAt: "z" },
      ],
    };
    expect(getTaxiRosterPlayerIds(rosters).sort()).toEqual(["p1", "p2"]);
  });

  it("filters out drafted and taxi roster players when computing eligible players", () => {
    const eligible = getEligibleTaxiPlayers(samplePlayers, ["p3"], sampleRosters);
    expect(eligible.map((player) => player.id)).toEqual([]);

    const eligibleWithDraftedSet = getEligibleTaxiPlayers(samplePlayers, new Set(["p1"]), sampleRosters);
    expect(eligibleWithDraftedSet.map((player) => player.id)).toEqual(["p3"]);
  });

  it("adds and removes taxi roster entries immutably", () => {
    const added = addPlayerToTaxiRoster(sampleRosters, "teamA", "p3", "2026-01-02T00:00:00.000Z", 3);
    expect(added.teamA).toHaveLength(2);
    expect(added.teamA[1]).toMatchObject({ playerId: "p3", teamId: "teamA", pickNumber: 3 });
    expect(sampleRosters.teamA).toHaveLength(1);

    const removed = removePlayerFromTaxiRoster(added, "teamA", "p3");
    expect(removed.teamA).toHaveLength(1);
    expect(removed.teamA[0].playerId).toBe("p1");
  });

  it("prevents duplicate taxi roster entries for the same player", () => {
    const added = addPlayerToTaxiRoster(sampleRosters, "teamA", "p1", "2026-01-02T00:00:00.000Z");
    expect(added).toBe(sampleRosters);
  });

  it("replaces a taxi roster player while preserving entry metadata", () => {
    const replaced = replaceTaxiRosterPlayer(sampleRosters, "teamA", "p1", "p3");
    expect(replaced.teamA[0]).toMatchObject({ playerId: "p3", teamId: "teamA", pickNumber: 1, addedAt: "2026-01-01T00:00:00.000Z" });
    expect(sampleRosters.teamA[0].playerId).toBe("p1");
  });

  it("does not replace when the new player already exists in any roster", () => {
    const replaced = replaceTaxiRosterPlayer(sampleRosters, "teamA", "p1", "p2");
    expect(replaced).toBe(sampleRosters);
  });

  it("searches eligible taxi players by name, team, or position", () => {
    const searchRosters: TaxiRosters = {
      teamA: [
        { playerId: "p1", teamId: "teamA", addedAt: "2026-01-01T00:00:00.000Z", pickNumber: 1 },
      ],
    };
    const results = searchEligibleTaxiPlayers(samplePlayers, "Bravo", ["p1"], searchRosters);
    expect(results.map(p => p.id)).toEqual(["p2"]);

    const teamResults = searchEligibleTaxiPlayers(samplePlayers, "BOS", ["p1"], searchRosters);
    expect(teamResults.map(p => p.id)).toEqual(["p2"]);

    const positionResults = searchEligibleTaxiPlayers(samplePlayers, "2B", ["p1"], searchRosters);
    expect(positionResults.map(p => p.id)).toEqual(["p2"]);

    const noResults = searchEligibleTaxiPlayers(samplePlayers, "nonexistent", ["p1"], searchRosters);
    expect(noResults).toEqual([]);
  });
});
