import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./catalogPlayerFetch", () => ({
  getOrRefreshCatalogPlayers: vi.fn(),
}));

import mongoose from "mongoose";
import type { ILeague } from "../models/League";
import type { IRosterEntry } from "../models/RosterEntry";
import type { PlayerData } from "./playerCatalog";
import { getOrRefreshCatalogPlayers } from "./catalogPlayerFetch";
import {
  computeBudgetByTeamRemaining,
  stage3bOpeningBudgetByTeamId,
  STAGE3B_OPENING_BUDGET_REMAINING_TOTAL,
  buildValuationContext,
  buildEngineValuationCalculateBodyFromFixture,
  buildEngineValuationCalculateBodyFromFlat,
  finalizeEngineValuationPostPayload,
  leagueRosterSlotsForEngine,
  playerDataToInjuryOverrides,
  resolveLeagueNumTeams,
} from "./engineContext";
import {
  valuationRequestSchema,
  valuationFlatRequestSchema,
} from "../validation/valuationRequestSchema";

describe("stage3bOpeningBudgetByTeamId", () => {
  it("sums to Stage 3b opening total for any team count", () => {
    for (const n of [9, 12]) {
      const m = stage3bOpeningBudgetByTeamId(n);
      const sum = Object.values(m).reduce((s, v) => s + v, 0);
      expect(sum).toBe(STAGE3B_OPENING_BUDGET_REMAINING_TOTAL);
      expect(Object.keys(m)).toHaveLength(n);
    }
  });
});

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

describe("playerDataToInjuryOverrides", () => {
  it("clamps severity to 0–3 and defaults missing to 0", () => {
    expect(
      playerDataToInjuryOverrides([
        { id: "1", injurySeverity: 99 } as PlayerData,
        { id: "2" } as PlayerData,
        { id: "3", injurySeverity: -5 } as PlayerData,
      ]),
    ).toEqual([
      { player_id: "1", injury_severity: 3 },
      { player_id: "2", injury_severity: 0 },
      { player_id: "3", injury_severity: 0 },
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
  beforeEach(() => {
    vi.mocked(getOrRefreshCatalogPlayers).mockClear();
    vi.mocked(getOrRefreshCatalogPlayers).mockResolvedValue([]);
  });

  it("maps league and roster entries including context parity fields", async () => {
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

    vi.mocked(getOrRefreshCatalogPlayers).mockResolvedValue([
      {
        id: "660272",
        mlbId: 660272,
        catalog_kind: "valuation_eligible",
        valuation_eligible: true,
        name: "Auction Pick",
        team: "BOS",
        position: "OF",
        positions: ["LF", "OF"],
        age: 28,
        catalog_rank: 1,
        value: 10,
        catalog_tier: 2,
        headshot: "",
        stats: {},
        projection: {},
        outlook: "",
        injurySeverity: 0,
      } as PlayerData,
      {
        id: "660273",
        mlbId: 660273,
        catalog_kind: "valuation_eligible",
        valuation_eligible: true,
        name: "Minor Stash",
        team: "SEA",
        position: "SP",
        positions: ["SP"],
        age: 22,
        catalog_rank: 2,
        value: 5,
        catalog_tier: 4,
        headshot: "",
        stats: {},
        projection: {},
        outlook: "",
        injurySeverity: 2,
        injuryStatus: "IL10",
      } as PlayerData,
    ]);

    const ctx = await buildValuationContext(league, entries, { userTeamId: "team_2" });

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
    expect(ctx.budget_by_team_id).toEqual({ team_1: 235, team_2: 242 });
    expect(ctx.scoring_format).toBe("5x5");
    expect(ctx.hitter_budget_pct).toBe(72);
    expect(ctx.pos_eligibility_threshold).toBe(15);
    expect(ctx.user_team_id).toBe("team_2");
    expect(ctx.inflation_model).toBe("replacement_slots_v2");

    expect(ctx.position_overrides).toBeUndefined();
    expect(ctx.injury_overrides).toBeUndefined();
    expect(ctx.player_ids).toBeUndefined();
    expect(vi.mocked(getOrRefreshCatalogPlayers)).not.toHaveBeenCalled();

    const draftedRow = ctx.drafted_players.find((p) => p.player_id === "660272");
    expect(draftedRow?.positions).toEqual(["OF"]);
  });

  it("syncCatalogEligibilityToEngine pushes full catalog envelope (legacy)", async () => {
    const league = {
      rosterSlots: { OF: 2 },
      scoringCategories: [{ name: "HR", type: "batting" as const }],
      budget: 260,
      teams: 2,
      playerPool: "Mixed" as const,
      posEligibilityThreshold: 15,
    } as unknown as ILeague;

    const entries = [
      {
        externalPlayerId: "660272",
        playerName: "Auction Pick",
        positions: ["OF"],
        rosterSlot: "OF",
        teamId: "team_1",
        price: 18,
        isKeeper: false,
        playerTeam: "BOS",
      },
    ] as unknown as IRosterEntry[];

    vi.mocked(getOrRefreshCatalogPlayers).mockResolvedValue([
      {
        id: "660272",
        mlbId: 660272,
        catalog_kind: "valuation_eligible",
        valuation_eligible: true,
        name: "Auction Pick",
        team: "BOS",
        position: "OF",
        positions: ["LF", "OF"],
        age: 28,
        catalog_rank: 1,
        value: 10,
        catalog_tier: 2,
        headshot: "",
        stats: {},
        projection: {},
        outlook: "",
        injurySeverity: 0,
      } as PlayerData,
      {
        id: "660273",
        mlbId: 660273,
        catalog_kind: "valuation_eligible",
        valuation_eligible: true,
        name: "Undrafted",
        team: "SEA",
        position: "SP",
        positions: ["SP"],
        age: 22,
        catalog_rank: 2,
        value: 5,
        catalog_tier: 4,
        headshot: "",
        stats: {},
        projection: {},
        outlook: "",
        injurySeverity: 2,
      } as PlayerData,
    ]);

    const ctx = await buildValuationContext(league, entries, {
      syncCatalogEligibilityToEngine: true,
    });

    expect(ctx.position_overrides).toEqual([
      { player_id: "660272", positions: ["LF", "OF"] },
      { player_id: "660273", positions: ["SP"] },
    ]);
    expect(ctx.injury_overrides).toEqual([
      { player_id: "660272", injury_severity: 0 },
      { player_id: "660273", injury_severity: 2 },
    ]);
    expect(ctx.player_ids).toEqual(["660273"]);
    expect(vi.mocked(getOrRefreshCatalogPlayers)).toHaveBeenCalledWith(15);
  });

  it("includes keeper salaries in budget_by_team_id (Mongo / Research path)", async () => {
    const league = {
      rosterSlots: { OF: 1 },
      scoringCategories: [{ name: "HR", type: "batting" as const }],
      budget: 260,
      teams: 3,
      playerPool: "Mixed" as const,
    } as unknown as ILeague;

    const entries = [
      {
        externalPlayerId: "k1",
        playerName: "Keeper A",
        positions: ["1B"],
        rosterSlot: "1B",
        teamId: "team_1",
        price: 40,
        isKeeper: true,
        playerTeam: "TOR",
      },
      {
        externalPlayerId: "k2",
        playerName: "Keeper B",
        positions: ["SS"],
        rosterSlot: "SS",
        teamId: "team_2",
        price: 30,
        isKeeper: true,
        playerTeam: "BOS",
      },
      {
        externalPlayerId: "p1",
        playerName: "Auction Pick",
        positions: ["OF"],
        rosterSlot: "OF",
        teamId: "team_3",
        price: 20,
        isKeeper: false,
        playerTeam: "NYY",
      },
    ] as unknown as IRosterEntry[];

    const ctx = await buildValuationContext(league, entries, {});

    expect(ctx.budget_by_team_id).toEqual({
      team_1: 220,
      team_2: 230,
      team_3: 240,
    });
    const sumRemaining = Object.values(ctx.budget_by_team_id ?? {}).reduce(
      (s, v) => s + v,
      0,
    );
    expect(sumRemaining).toBe(260 * 3 - (40 + 30 + 20));
    expect(ctx.drafted_players).toHaveLength(1);
    expect(ctx.pre_draft_rosters).toHaveLength(2);
  });

  it("passes eligible_player_ids when provided", async () => {
    const league = {
      rosterSlots: {},
      scoringCategories: [],
      budget: 260,
      teams: 2,
      playerPool: "Mixed" as const,
    } as unknown as ILeague;

    const ctx = await buildValuationContext(league, [], {
      eligible_player_ids: ["592450", "660271"],
    });
    expect(ctx.eligible_player_ids).toEqual(["592450", "660271"]);
    expect(vi.mocked(getOrRefreshCatalogPlayers)).not.toHaveBeenCalled();
  });

  it("uses Stage 3b demo calibration only for the Original preset when empty", async () => {
    const original = {
      rosterSlots: { C: 1, UTIL: 1, BN: 1 },
      scoringCategories: [],
      budget: 260,
      teams: 12,
      name: "Original",
      playerPool: "Mixed" as const,
    } as unknown as ILeague;

    const ctx = await buildValuationContext(original, [], {});
    expect(ctx.opening_board_calibration).toBe("stage3b_demo_v1");
    expect(ctx.budget_by_team_id).toEqual(stage3bOpeningBudgetByTeamId(12));
    expect(
      Object.values(ctx.budget_by_team_id ?? {}).reduce((s, v) => s + v, 0),
    ).toBe(STAGE3B_OPENING_BUDGET_REMAINING_TOTAL);
    expect(ctx.pre_draft_rosters?.length ?? 0).toBeGreaterThan(0);
  });

  it("does not inject demo calibration for other empty user leagues", async () => {
    const league = {
      rosterSlots: { C: 1, UTIL: 1, BN: 1 },
      scoringCategories: [],
      budget: 260,
      teams: 12,
      name: "My Auction League",
      playerPool: "Mixed" as const,
    } as unknown as ILeague;

    const ctx = await buildValuationContext(league, [], {});
    expect(ctx.opening_board_calibration).toBeUndefined();
    expect(ctx.pre_draft_rosters ?? []).toHaveLength(0);
    expect(ctx.budget_by_team_id?.team_1).toBe(260);
  });

  it("passes League.posEligibilityThreshold into catalog fetch when syncing catalog", async () => {
    const league = {
      rosterSlots: {},
      scoringCategories: [],
      budget: 260,
      teams: 2,
      playerPool: "Mixed" as const,
      posEligibilityThreshold: 7,
    } as unknown as ILeague;

    vi.mocked(getOrRefreshCatalogPlayers).mockResolvedValueOnce([
      {
        id: "1",
        mlbId: 1,
        catalog_kind: "valuation_eligible",
        valuation_eligible: true,
        name: "X",
        team: "NYY",
        position: "SS",
        positions: ["SS"],
        age: 25,
        catalog_rank: 1,
        value: 8,
        catalog_tier: 2,
        headshot: "",
        stats: {},
        projection: {},
        outlook: "",
      } as PlayerData,
    ]);

    await buildValuationContext(league, [], {
      syncCatalogEligibilityToEngine: true,
    });
    expect(vi.mocked(getOrRefreshCatalogPlayers)).toHaveBeenCalledWith(7);
  });

  it("uses threshold 20 when league omits posEligibilityThreshold (catalog sync)", async () => {
    const league = {
      rosterSlots: {},
      scoringCategories: [],
      budget: 260,
      teams: 2,
      playerPool: "Mixed" as const,
    } as unknown as ILeague;

    vi.mocked(getOrRefreshCatalogPlayers).mockResolvedValueOnce([]);
    await buildValuationContext(league, [], {
      syncCatalogEligibilityToEngine: true,
    });
    expect(vi.mocked(getOrRefreshCatalogPlayers)).toHaveBeenCalledWith(20);
  });

  it("excludes market_only from catalog envelope when syncing", async () => {
    const league = {
      rosterSlots: {},
      scoringCategories: [],
      budget: 260,
      teams: 2,
      playerPool: "Mixed" as const,
    } as unknown as ILeague;

    vi.mocked(getOrRefreshCatalogPlayers).mockResolvedValueOnce([
      {
        id: "669923",
        mlbId: 669923,
        catalog_kind: "market_only",
        valuation_eligible: false,
        market_adp: 14,
        name: "George Kirby",
        team: "SEA",
        position: "SP",
        positions: ["SP"],
        age: 28,
        catalog_rank: 9998,
        value: 0,
        catalog_tier: 5,
        headshot: "",
        stats: {},
        projection: {},
        outlook: "",
      } as PlayerData,
      {
        id: "999001",
        mlbId: 999001,
        catalog_kind: "roster_context",
        valuation_eligible: false,
        name: "Roster Only",
        team: "SEA",
        position: "RP",
        positions: ["RP"],
        age: 24,
        catalog_rank: 9999,
        value: 0,
        catalog_tier: 5,
        headshot: "",
        stats: {},
        projection: {},
        outlook: "",
      } as PlayerData,
      {
        id: "660273",
        mlbId: 660273,
        catalog_kind: "valuation_eligible",
        valuation_eligible: true,
        name: "Valued",
        team: "NYY",
        position: "SS",
        positions: ["SS"],
        age: 26,
        catalog_rank: 5,
        value: 20,
        catalog_tier: 2,
        headshot: "",
        stats: {},
        projection: {},
        outlook: "",
        injurySeverity: 0,
      } as PlayerData,
    ]);

    const ctx = await buildValuationContext(league, [], {
      syncCatalogEligibilityToEngine: true,
    });
    expect(ctx.position_overrides).toEqual([{ player_id: "660273", positions: ["SS"] }]);
    expect(ctx.injury_overrides).toEqual([{ player_id: "660273", injury_severity: 0 }]);
    expect(ctx.player_ids).toEqual(["660273"]);
    expect(ctx.player_ids?.includes("669923")).toBe(false);
    expect(ctx.player_ids?.includes("999001")).toBe(false);
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
    expect(body.auction_curve_model).toBe("adaptive_surplus_v1");
  });
});
