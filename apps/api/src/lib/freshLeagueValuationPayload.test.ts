import { describe, it, expect } from "vitest";
import type { ILeague } from "../models/League";
import {
  buildValuationContext,
  finalizeEngineValuationPostPayload,
  summarizeEngineValuationPayload,
} from "./engineContext";

/** Same totals as League model defaults (21 slots / team). */
const DEFAULT_ROSTER_RECORD: Record<string, number> = {
  C: 1,
  "1B": 1,
  "2B": 1,
  "3B": 1,
  SS: 1,
  OF: 3,
  UTIL: 1,
  SP: 2,
  RP: 2,
  P: 3,
  BN: 5,
};

const SLOT_SUM = 21;

function freshLeague(teams: number): ILeague {
  return {
    rosterSlots: DEFAULT_ROSTER_RECORD,
    scoringCategories: [{ name: "HR", type: "batting" }],
    budget: 260,
    teams,
    teamNames: Array.from({ length: teams }, (_, i) => `Team ${i + 1}`),
    memberIds: [],
    playerPool: "Mixed",
  } as unknown as ILeague;
}

function payloadSummary(teams: number) {
  const ctx = buildValuationContext(freshLeague(teams), [], {});
  const payload = finalizeEngineValuationPostPayload(ctx) as Record<
    string,
    unknown
  >;
  return summarizeEngineValuationPayload(payload);
}

describe("fresh league valuation POST payload (normalized roster_slots)", () => {
  it("6-team: roster geometry and budget pool for Command Center verification", () => {
    const s = payloadSummary(6);
    expect(s.roster_slot_count_sum).toBe(SLOT_SUM);
    expect(s.num_teams).toBe(6);
    expect(s.drafted_players_length).toBe(0);
    expect(s.pre_draft_rosters_player_count).toBe(0);
    expect(s.minors_player_count).toBe(0);
    expect(s.taxi_player_count).toBe(0);
    expect(s.budget_by_team_id_sum).toBe(260 * 6);
    // Run with `pnpm --filter api exec vitest run src/lib/freshLeagueValuationPayload.test.ts --reporter=verbose` to print the log line below.
    console.info("[verify-fresh-6-team]", JSON.stringify(s, null, 2));
  });

  it("12-team: roster geometry and budget pool", () => {
    const s = payloadSummary(12);
    expect(s.roster_slot_count_sum).toBe(SLOT_SUM);
    expect(s.num_teams).toBe(12);
    expect(s.drafted_players_length).toBe(0);
    expect(s.budget_by_team_id_sum).toBe(260 * 12);
    console.info("[verify-fresh-12-team]", JSON.stringify(s, null, 2));
  });

  it("array-shaped rosterSlots (Mongo Mixed) still yields correct slot sum", () => {
    const league = {
      ...freshLeague(6),
      rosterSlots: [
        { position: "C", count: 1 },
        { position: "OF", count: 3 },
        { position: "BN", count: 5 },
      ],
    } as unknown as ILeague;
    const ctx = buildValuationContext(league, [], {});
    const s = summarizeEngineValuationPayload(
      finalizeEngineValuationPostPayload(ctx) as Record<string, unknown>,
    );
    expect(s.roster_slot_count_sum).toBe(9);
  });
});
