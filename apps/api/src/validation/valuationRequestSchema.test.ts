import { describe, it, expect } from "vitest";
import {
  valuationRequestSchema,
  normalizeRosterSlots,
} from "./valuationRequestSchema";

const minimalLeague = {
  roster_slots: { C: 1, OF: 3 },
  scoring_categories: [{ name: "HR", type: "batting" as const }],
  total_budget: 260,
  num_teams: 12,
  league_scope: "Mixed" as const,
};

describe("valuationRequestSchema", () => {
  it("accepts pre_draft with empty draft_state", () => {
    const parsed = valuationRequestSchema.parse({
      schemaVersion: "1.0.0",
      checkpoint: "pre_draft",
      league: minimalLeague,
      draft_state: [],
    });
    expect(parsed.checkpoint).toBe("pre_draft");
    expect(parsed.draft_state).toEqual([]);
  });

  it("rejects wrong schemaVersion", () => {
    const r = valuationRequestSchema.safeParse({
      schemaVersion: "0.9.0",
      checkpoint: "pre_draft",
      league: minimalLeague,
      draft_state: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid checkpoint", () => {
    const r = valuationRequestSchema.safeParse({
      schemaVersion: "1.0.0",
      checkpoint: "after_pick_99",
      league: minimalLeague,
      draft_state: [],
    });
    expect(r.success).toBe(false);
  });

  it("accepts roster_slots as array of { position, count }", () => {
    const parsed = valuationRequestSchema.parse({
      schemaVersion: "1.0.0",
      checkpoint: "pre_draft",
      league: {
        ...minimalLeague,
        roster_slots: [
          { position: "C", count: 1 },
          { position: "OF", count: 3 },
        ],
      },
      draft_state: [],
    });
    expect(parsed.league.roster_slots).toEqual([
      { position: "C", count: 1 },
      { position: "OF", count: 3 },
    ]);
  });

  it("accepts optional minors, taxi, deterministic, seed", () => {
    const parsed = valuationRequestSchema.parse({
      schemaVersion: "1.0.0",
      checkpoint: "after_pick_10",
      league: minimalLeague,
      draft_state: [],
      minors: [{ team_id: "team_1", players: [] }],
      taxi: [{ team_id: "team_2", players: [] }],
      deterministic: true,
      seed: 99,
    });
    expect(parsed.minors).toHaveLength(1);
    expect(parsed.seed).toBe(99);
  });
});

describe("normalizeRosterSlots", () => {
  it("passes through array form", () => {
    const slots = [
      { position: "SP", count: 2 },
      { position: "RP", count: 2 },
    ];
    expect(normalizeRosterSlots(slots)).toEqual(slots);
  });

  it("expands record form", () => {
    expect(
      normalizeRosterSlots({ UTIL: 1, BN: 5 }),
    ).toEqual(
      expect.arrayContaining([
        { position: "UTIL", count: 1 },
        { position: "BN", count: 5 },
      ]),
    );
  });
});
