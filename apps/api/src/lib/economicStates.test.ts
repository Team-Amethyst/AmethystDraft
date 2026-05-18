import { describe, expect, it } from "vitest";
import {
  buildValuationContext,
  finalizeEngineValuationPostPayload,
} from "./engineContext";
import {
  leagueQualifiesForStage3bDemoOpeningCalibration,
  STAGE3B_DEMO_OPENING_CALIBRATION,
} from "./stage3bDemoCalibration";
import type { ILeague } from "../models/League";
import type { IRosterEntry } from "../models/RosterEntry";

const baseLeague = {
  budget: 260,
  teams: 12,
  rosterSlots: {
    C: 1,
    "1B": 1,
    "2B": 1,
    SS: 1,
    "3B": 1,
    MI: 1,
    CI: 1,
    OF: 3,
    UTIL: 1,
    SP: 5,
    RP: 2,
    BN: 3,
  },
  scoringCategories: [
    { name: "R", type: "batting" as const },
    { name: "HR", type: "batting" as const },
    { name: "RBI", type: "batting" as const },
    { name: "SB", type: "batting" as const },
    { name: "AVG", type: "batting" as const },
    { name: "W", type: "pitching" as const },
    { name: "SV", type: "pitching" as const },
    { name: "K", type: "pitching" as const },
    { name: "ERA", type: "pitching" as const },
    { name: "WHIP", type: "pitching" as const },
  ],
  playerPool: "Mixed" as const,
  scoringFormat: "5x5" as const,
  posEligibilityThreshold: 20,
  memberIds: ["u1"],
} satisfies Partial<ILeague>;

describe("economic state BFF boundaries", () => {
  it("qualifies only Original for demo opening calibration", () => {
    expect(leagueQualifiesForStage3bDemoOpeningCalibration({ name: "Original" })).toBe(
      true,
    );
    expect(
      leagueQualifiesForStage3bDemoOpeningCalibration({ name: "Friendly League" }),
    ).toBe(false);
    expect(
      leagueQualifiesForStage3bDemoOpeningCalibration({ name: "[Demo] pre draft" }),
    ).toBe(false);
  });

  it("true empty non-Original has no demo augmentation on payload", async () => {
    const league = { ...baseLeague, name: "Friendly League" } as ILeague;
    const ctx = await buildValuationContext(league, []);
    const payload = finalizeEngineValuationPostPayload(ctx);
    expect(payload.opening_board_calibration).toBeUndefined();
    expect(payload.pre_draft_rosters ?? []).toHaveLength(0);
    expect(
      Object.values((payload.budget_by_team_id as Record<string, number>) ?? {}).reduce(
        (s, v) => s + v,
        0,
      ),
    ).toBe(260 * 12);
  });

  it("true empty Original sends demo flag and synthetic keeper preset", async () => {
    const league = { ...baseLeague, name: "Original" } as ILeague;
    const ctx = await buildValuationContext(league, []);
    const payload = finalizeEngineValuationPostPayload(ctx);
    expect(payload.opening_board_calibration).toBe(STAGE3B_DEMO_OPENING_CALIBRATION);
    expect((payload.pre_draft_rosters as unknown[])?.length).toBeGreaterThan(0);
    const totalBudget = Object.values(
      (payload.budget_by_team_id as Record<string, number>) ?? {},
    ).reduce((s, v) => s + v, 0);
    expect(totalBudget).toBeLessThan(260 * 12);
  });

  it("Original with one auction pick drops demo calibration", async () => {
    const league = { ...baseLeague, name: "Original" } as ILeague;
    const entries = [
      {
        isKeeper: false,
        rosterSlot: "C",
        externalPlayerId: "661388",
        playerName: "William Contreras",
        playerTeam: "MIL",
        positions: ["C"],
        price: 25,
        teamId: "team_1",
      },
    ] as IRosterEntry[];
    const ctx = await buildValuationContext(league, entries);
    expect(ctx.opening_board_calibration).toBeUndefined();
    expect((ctx.pre_draft_rosters ?? []).length).toBe(0);
  });
});
