import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { valuationIncomingSchema } from "../validation/schemas";
import { valuationIncomingToEngineContext } from "./engineContext";
import { extractCheckpointLeagueAndRoster } from "./leagueFromEngineCheckpoint";

/**
 * Display names live on league metadata (fixture team_names → Mongo teamNames).
 * Engine valuation POST bodies use team_id only; this file guards that split.
 */
describe("team display names vs engine team ids", () => {
  it("pre_draft fixture stores league.team_names for import/wizard", () => {
    const file = path.join(
      process.cwd(),
      "test-fixtures",
      "player-api",
      "checkpoints",
      "pre_draft.json",
    );
    const raw = JSON.parse(readFileSync(file, "utf8"));
    expect(raw.league.team_names).toEqual([
      "Team A",
      "Team B",
      "Team C",
      "Team D",
      "Team E",
      "Team F",
      "Team G",
      "Team H",
      "Team I",
    ]);
  });

  it("extractCheckpointLeagueAndRoster maps fixture team_names to league.teamNames", () => {
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
    const extracted = extractCheckpointLeagueAndRoster(parsed);
    expect(extracted.teamNames).toEqual(["Team A", "Team B", "Team C"]);
  });

  it("valuationIncomingToEngineContext does not require team_names on engine body", () => {
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
      draft_state: [
        {
          player_id: "1",
          name: "Pick",
          positions: ["OF"],
          team: "BOS",
          team_id: "team_2",
          paid: 5,
          roster_slot: "OF",
        },
      ],
    });
    const ctx = valuationIncomingToEngineContext(parsed);
    expect(ctx.team_names).toBeUndefined();
    expect(ctx.drafted_players[0]?.team_id).toBe("team_2");
  });
});
