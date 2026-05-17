import { describe, it, expect } from "vitest";
import { valuationIncomingSchema } from "../validation/schemas";
import { extractCheckpointLeagueAndRoster } from "./leagueFromEngineCheckpoint";

describe("extractCheckpointLeagueAndRoster", () => {
  it("maps nested Activity #9 fixture to league rows", () => {
    const parsed = valuationIncomingSchema.parse({
      schemaVersion: "1.0.0",
      checkpoint: "pre_draft",
      league: {
        roster_slots: { OF: 1, UTIL: 1 },
        scoring_categories: [{ name: "HR", type: "batting" }],
        total_budget: 100,
        num_teams: 2,
        league_scope: "Mixed",
      },
      draft_state: [],
    });
    const x = extractCheckpointLeagueAndRoster(parsed);
    expect(x.teams).toBe(2);
    expect(x.budget).toBe(100);
    expect(x.rosterSlots.OF).toBe(1);
    expect(x.rosterRows).toHaveLength(0);
  });

  it("uses fixture team_names when present", () => {
    const parsed = valuationIncomingSchema.parse({
      schemaVersion: "1.0.0",
      checkpoint: "pre_draft",
      league: {
        roster_slots: { OF: 1 },
        scoring_categories: [{ name: "HR", type: "batting" }],
        total_budget: 260,
        num_teams: 3,
        league_scope: "Mixed",
        team_names: ["Team A", "Team B", "Team C"],
      },
      draft_state: [],
    });
    const x = extractCheckpointLeagueAndRoster(parsed);
    expect(x.teamNames).toEqual(["Team A", "Team B", "Team C"]);
  });

  it("includes auction picks and keepers", () => {
    const parsed = valuationIncomingSchema.parse({
      schemaVersion: "1.0.0",
      checkpoint: "after_pick_10",
      league: {
        roster_slots: { OF: 1 },
        scoring_categories: [{ name: "HR", type: "batting" }],
        total_budget: 100,
        num_teams: 2,
        league_scope: "Mixed",
      },
      pre_draft_rosters: [
        {
          team_id: "team_1",
          players: [
            {
              player_id: "999",
              name: "Keeper",
              team: "NYY",
              team_id: "team_1",
              paid: 5,
              is_keeper: true,
              roster_slot: "OF",
            },
          ],
        },
      ],
      draft_state: [
        {
          player_id: "660001",
          name: "Pick",
          positions: ["OF"],
          team: "BOS",
          team_id: "team_2",
          paid: 3,
          pick_number: 1,
          roster_slot: "OF",
        },
      ],
    });
    const x = extractCheckpointLeagueAndRoster(parsed);
    expect(x.rosterRows).toHaveLength(2);
    expect(x.rosterRows.find((r) => r.externalPlayerId === "999")?.isKeeper).toBe(
      true,
    );
    expect(x.rosterRows.find((r) => r.externalPlayerId === "660001")?.isKeeper).toBe(
      false,
    );
  });
});
