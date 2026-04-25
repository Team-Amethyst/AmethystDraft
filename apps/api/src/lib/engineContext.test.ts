import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import type { ILeague } from "../models/League";
import type { IRosterEntry } from "../models/RosterEntry";
import {
  computeBudgetByTeamRemaining,
  buildValuationContext,
  buildEngineValuationCalculateBodyFromFixture,
  buildEngineValuationCalculateBodyFromFlat,
  finalizeEngineValuationPostPayload,
  leagueRosterSlotsForEngine,
  resolveLeagueNumTeams,
} from "./engineContext";
import {
  valuationRequestSchema,
  valuationFlatRequestSchema,
} from "../validation/valuationRequestSchema";

describe("computeBudgetByTeamRemaining", () => {
  it("returns full budget for every team when no players", () => {
    expect(computeBudgetByTeamRemaining(260, [], 12)).toEqual({
      team_1: 260,
      team_2: 260,
      team_3: 260,
      team_4: 260,
      team_5: 260,
      team_6: 260,
      team_7: 260,
      team_8: 260,
      team_9: 260,
      team_10: 260,
      team_11: 260,
      team_12: 260,
    });
  });

  it("subtracts paid amounts per team_id", () => {
    const drafted = [
      {
        player_id: "1",
        name: "A",
        position: "OF",
        team: "NYY",
        team_id: "team_1",
        paid: 50,
      },
      {
        player_id: "2",
        name: "B",
        position: "OF",
        team: "NYY",
        team_id: "team_1",
        paid: 30,
      },
      {
        player_id: "3",
        name: "C",
        position: "SP",
        team: "LAD",
        team_id: "team_2",
        paid: 40,
      },
    ];
    const out = computeBudgetByTeamRemaining(260, drafted, 12);
    expect(out.team_1).toBe(180);
    expect(out.team_2).toBe(220);
    expect(out.team_3).toBe(260);
  });

  it("treats missing paid as 0", () => {
    const out = computeBudgetByTeamRemaining(
      100,
      [
        {
          player_id: "1",
          name: "A",
          position: "P",
          team: "X",
          team_id: "team_1",
        },
      ],
      2,
    );
    expect(out.team_1).toBe(100);
  });
});

describe("leagueRosterSlotsForEngine", () => {
  it("accepts array-shaped rosterSlots (Mongo Mixed) without Object.entries corruption", () => {
    const league = {
      rosterSlots: [
        { position: "C", count: 1 },
        { position: "OF", count: 3 },
        { position: "BN", count: 5 },
      ],
      scoringCategories: [],
      budget: 260,
      teams: 6,
      teamNames: [],
      memberIds: [],
      playerPool: "Mixed" as const,
    } as unknown as ILeague;
    expect(leagueRosterSlotsForEngine(league)).toEqual([
      { position: "C", count: 1 },
      { position: "OF", count: 3 },
      { position: "BN", count: 5 },
    ]);
  });

  it("coerces string counts and plain record input", () => {
    const league = {
      rosterSlots: { C: "1" as unknown as number, UTIL: 2 },
      scoringCategories: [],
      budget: 260,
      teams: 2,
      teamNames: [],
      memberIds: [],
      playerPool: "Mixed" as const,
    } as unknown as ILeague;
    expect(leagueRosterSlotsForEngine(league)).toEqual([
      { position: "C", count: 1 },
      { position: "UTIL", count: 2 },
    ]);
  });
});

describe("resolveLeagueNumTeams", () => {
  it("uses explicit teams when valid", () => {
    const league = {
      rosterSlots: {},
      scoringCategories: [],
      budget: 260,
      teams: 6,
      teamNames: ["a"],
      memberIds: [],
      playerPool: "Mixed" as const,
    } as unknown as ILeague;
    expect(resolveLeagueNumTeams(league)).toBe(6);
  });

  it("falls back to teamNames.length when teams is missing", () => {
    const league = {
      rosterSlots: {},
      scoringCategories: [],
      budget: 260,
      teams: undefined,
      teamNames: ["a", "b", "c", "d", "e", "f"],
      memberIds: [new mongoose.Types.ObjectId()],
      playerPool: "Mixed" as const,
    } as unknown as ILeague;
    expect(resolveLeagueNumTeams(league)).toBe(6);
  });
});

describe("buildValuationContext", () => {
  it("maps league and roster entries including context parity fields", () => {
    const league = {
      rosterSlots: { OF: 2 },
      scoringCategories: [{ name: "HR", type: "batting" as const }],
      budget: 260,
      teams: 2,
      playerPool: "Mixed" as const,
      scoringFormat: "5x5" as const,
      hitterBudgetPct: 72,
      posEligibilityThreshold: 15,
    } as unknown as ILeague;

    const entries = [
      {
        externalPlayerId: "660271",
        playerName: "Keeper",
        positions: ["1B"],
        rosterSlot: "1B",
        teamId: "team_1",
        price: 25,
        isKeeper: true,
        playerTeam: "TOR",
      },
      {
        externalPlayerId: "660272",
        playerName: "Auction Pick",
        positions: ["OF"],
        rosterSlot: "OF",
        teamId: "team_2",
        price: 18,
        isKeeper: false,
        playerTeam: "BOS",
      },
      {
        externalPlayerId: "660273",
        playerName: "Minor Stash",
        positions: ["SP"],
        rosterSlot: "MIN1",
        teamId: "team_2",
        price: 1,
        isKeeper: false,
        playerTeam: "SEA",
      },
      {
        externalPlayerId: "660274",
        playerName: "Taxi Arm",
        positions: ["RP"],
        rosterSlot: "TAXI",
        teamId: "team_1",
        price: 2,
        isKeeper: false,
        playerTeam: "HOU",
      },
    ] as unknown as IRosterEntry[];

    const ctx = buildValuationContext(league, entries, { userTeamId: "team_2" });

    expect(ctx.roster_slots).toEqual([{ position: "OF", count: 2 }]);
    expect(ctx.drafted_players).toEqual([
      expect.objectContaining({
        player_id: "660272",
        positions: ["OF"],
        roster_slot: "OF",
        paid: 18,
      }),
    ]);
    expect(ctx.pre_draft_rosters).toEqual([
      expect.objectContaining({
        team_id: "team_1",
        players: [
          expect.objectContaining({
            player_id: "660271",
            is_keeper: true,
          }),
        ],
      }),
    ]);
    expect(ctx.minors).toEqual([
      expect.objectContaining({
        team_id: "team_2",
        players: [expect.objectContaining({ player_id: "660273" })],
      }),
    ]);
    expect(ctx.taxi).toEqual([
      expect.objectContaining({
        team_id: "team_1",
        players: [expect.objectContaining({ player_id: "660274" })],
      }),
    ]);
    expect(ctx.budget_by_team_id).toEqual({ team_1: 260, team_2: 242 });
    expect(ctx.scoring_format).toBe("5x5");
    expect(ctx.hitter_budget_pct).toBe(72);
    expect(ctx.pos_eligibility_threshold).toBe(15);
    expect(ctx.user_team_id).toBe("team_2");
    expect(ctx.inflation_model).toBe("replacement_slots_v2");
  });
});

describe("buildEngineValuationCalculateBodyFromFixture", () => {
  it("uses league.budget_by_team_id when provided instead of computing", () => {
    const fixture = valuationRequestSchema.parse({
      schemaVersion: "1.0.0",
      checkpoint: "pre_draft",
      league: {
        ...{
          roster_slots: { OF: 1 },
          scoring_categories: [{ name: "HR", type: "batting" as const }],
          total_budget: 260,
          num_teams: 2,
          league_scope: "Mixed" as const,
        },
        budget_by_team_id: { team_1: 100, team_2: 200 },
      },
      draft_state: [],
    });
    const body = buildEngineValuationCalculateBodyFromFixture(fixture);
    expect(body.budget_by_team_id).toEqual({ team_1: 100, team_2: 200 });
  });

  it("puts auction picks in drafted_players and keepers in pre_draft_rosters", () => {
    const fixture = valuationRequestSchema.parse({
      schemaVersion: "1.0.0",
      checkpoint: "after_pick_10",
      league: {
        roster_slots: { OF: 1 },
        scoring_categories: [{ name: "HR", type: "batting" as const }],
        total_budget: 260,
        num_teams: 2,
        league_scope: "Mixed" as const,
      },
      pre_draft_rosters: [
        {
          team_id: "team_1",
          players: [
            {
              player_id: "k1",
              name: "Keeper",
              team_id: "team_1",
              paid: 10,
              is_keeper: true,
            },
          ],
        },
      ],
      draft_state: [
        {
          player_id: "p1",
          name: "Pick",
          team_id: "team_2",
          paid: 5,
          pick_number: 1,
        },
      ],
    });
    const body = buildEngineValuationCalculateBodyFromFixture(fixture);
    expect(body.drafted_players.map((p) => p.player_id)).toEqual(["p1"]);
    expect(body.pre_draft_rosters).toEqual(fixture.pre_draft_rosters);
    expect(body.budget_by_team_id?.team_1).toBe(250);
    expect(body.budget_by_team_id?.team_2).toBe(255);
    expect(body.checkpoint).toBe("after_pick_10");
    expect(body.schema_version).toBe("1.0.0");
  });
});

describe("finalizeEngineValuationPostPayload", () => {
  it("adds schemaVersion mirror and omits undefined keys", () => {
    const payload = finalizeEngineValuationPostPayload({
      roster_slots: [{ position: "OF", count: 1 }],
      scoring_categories: [{ name: "HR", type: "batting" }],
      total_budget: 260,
      num_teams: 12,
      league_scope: "Mixed",
      drafted_players: [],
      schema_version: "1.0.0",
    });
    expect(payload.schema_version).toBe("1.0.0");
    expect(payload.schemaVersion).toBe("1.0.0");
    expect("checkpoint" in payload).toBe(false);
  });
});

describe("buildEngineValuationCalculateBodyFromFlat", () => {
  it("builds engine body from flat request", () => {
    const body = buildEngineValuationCalculateBodyFromFlat(
      valuationFlatRequestSchema.parse({
        roster_slots: { OF: 1 },
        scoring_categories: [{ name: "HR", type: "batting" }],
        total_budget: 260,
        num_teams: 2,
        league_scope: "Mixed",
        drafted_players: [
          { player_id: "a", name: "A", team_id: "team_1", position: "OF" },
        ],
        schemaVersion: "1.0.0",
        checkpoint: "pre_draft",
        player_ids: ["660271"],
        user_team_id: "team_3",
      }),
    );
    expect(body.drafted_players[0]?.position).toBe("OF");
    expect(body.player_ids).toEqual(["660271"]);
    expect(body.schema_version).toBe("1.0.0");
    expect(body.user_team_id).toBe("team_3");
    expect(body.inflation_model).toBe("replacement_slots_v2");
  });
});
