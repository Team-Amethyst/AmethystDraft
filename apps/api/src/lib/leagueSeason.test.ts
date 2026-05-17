import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import {
  buildNewSeasonLeaguePayload,
  nextSeasonYear,
  persistedLeagueFamilyId,
  resolveSeasonYear,
} from "./leagueSeason";

describe("leagueSeason helpers", () => {
  it("resolveSeasonYear prefers stored seasonYear", () => {
    expect(
      resolveSeasonYear({
        seasonYear: 2024,
        createdAt: new Date("2026-06-01"),
      }),
    ).toBe(2024);
  });

  it("resolveSeasonYear falls back to createdAt calendar year", () => {
    expect(resolveSeasonYear({ createdAt: new Date("2025-07-01") })).toBe(2025);
  });

  it("persistedLeagueFamilyId falls back to league _id string", () => {
    const id = new mongoose.Types.ObjectId();
    expect(persistedLeagueFamilyId({ _id: id, leagueFamilyId: "" })).toBe(String(id));
    expect(persistedLeagueFamilyId({ _id: id, leagueFamilyId: "   " })).toBe(String(id));
    expect(persistedLeagueFamilyId({ _id: id, leagueFamilyId: "fam-1" })).toBe("fam-1");
  });

  it("nextSeasonYear increments when seasonYear omitted", () => {
    expect(nextSeasonYear({ seasonYear: 2026 })).toBe(2027);
  });

  it("nextSeasonYear honors explicit requested year", () => {
    expect(nextSeasonYear({ seasonYear: 2026 }, 2030)).toBe(2030);
  });

  it("buildNewSeasonLeaguePayload copies settings and links prior season", () => {
    const oid = new mongoose.Types.ObjectId();
    const prev = new mongoose.Types.ObjectId();
    const comm = new mongoose.Types.ObjectId();
    const m1 = new mongoose.Types.ObjectId();
    const payload = buildNewSeasonLeaguePayload(
      {
        _id: oid,
        leagueFamilyId: "family-a",
        name: "North Stars",
        commissionerId: comm,
        memberIds: [m1],
        budget: 300,
        hitterBudgetPct: 65,
        teams: 10,
        scoringFormat: "6x6",
        scoringCategories: [{ name: "HR", type: "batting" }],
        rosterSlots: { C: 2, SP: 4 },
        playerPool: "AL",
        posEligibilityThreshold: 15,
        teamNames: ["A", "B"],
      },
      2027,
      prev,
    );

    expect(payload).toMatchObject({
      name: "North Stars",
      budget: 300,
      hitterBudgetPct: 65,
      teams: 10,
      scoringFormat: "6x6",
      playerPool: "AL",
      posEligibilityThreshold: 15,
      teamNames: ["A", "B"],
      seasonYear: 2027,
      leagueFamilyId: "family-a",
      previousSeasonLeagueId: prev,
      draftStatus: "pre-draft",
      draftDate: undefined,
      taxiRosters: {},
      taxiDraftOrder: [],
    });
    expect(payload.memberIds).toEqual([m1]);
    expect(payload.rosterSlots).toEqual({ C: 2, SP: 4 });
    expect(payload.scoringCategories).toEqual([{ name: "HR", type: "batting" }]);
  });

  it("buildNewSeasonLeaguePayload uses _id as family when leagueFamilyId absent", () => {
    const oid = new mongoose.Types.ObjectId();
    const prev = new mongoose.Types.ObjectId();
    const comm = new mongoose.Types.ObjectId();
    const payload = buildNewSeasonLeaguePayload(
      {
        _id: oid,
        name: "Legacy",
        commissionerId: comm,
        memberIds: [],
        budget: 260,
        hitterBudgetPct: 70,
        teams: 12,
        scoringFormat: "5x5",
        scoringCategories: [],
        rosterSlots: { C: 1 },
        playerPool: "Mixed",
        posEligibilityThreshold: 20,
        teamNames: [],
      },
      2028,
      prev,
    );
    expect(payload.leagueFamilyId).toBe(String(oid));
  });
});
