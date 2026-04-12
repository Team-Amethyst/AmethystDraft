import { describe, it, expect } from "vitest";
import {
  valuationRequestSchema,
  valuationFlatRequestSchema,
  valuationIncomingSchema,
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

  it("accepts schema major 0", () => {
    const parsed = valuationRequestSchema.parse({
      schemaVersion: "0.9.0",
      checkpoint: "pre_draft",
      league: minimalLeague,
      draft_state: [],
    });
    expect(parsed.schemaVersion).toBe("0.9.0");
  });

  it("rejects schema major 2+", () => {
    const r = valuationRequestSchema.safeParse({
      schemaVersion: "2.0.0",
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

  it("accepts optional minors, taxi, deterministic, seed, player_ids", () => {
    const parsed = valuationRequestSchema.parse({
      schemaVersion: "1.0.0",
      checkpoint: "after_pick_10",
      league: minimalLeague,
      draft_state: [],
      minors: [{ team_id: "team_1", players: [] }],
      taxi: [{ team_id: "team_2", players: [] }],
      player_ids: ["660271", "660434"],
      deterministic: true,
      seed: 99,
    });
    expect(parsed.minors).toHaveLength(1);
    expect(parsed.player_ids).toEqual(["660271", "660434"]);
    expect(parsed.seed).toBe(99);
  });
});

describe("valuationFlatRequestSchema", () => {
  it("accepts flat body with drafted_players and default num_teams", () => {
    const parsed = valuationFlatRequestSchema.parse({
      roster_slots: { OF: 3 },
      scoring_categories: [{ name: "HR", type: "batting" }],
      total_budget: 260,
      league_scope: "Mixed",
      drafted_players: [
        {
          player_id: "1",
          name: "X",
          team_id: "team_1",
          paid: 1,
        },
      ],
    });
    expect(parsed.num_teams).toBe(12);
    expect(parsed.drafted_players).toHaveLength(1);
  });

  it("accepts pre_draft_rosters as record keyed by team_id", () => {
    const parsed = valuationFlatRequestSchema.parse({
      roster_slots: { C: 1 },
      scoring_categories: [{ name: "HR", type: "batting" }],
      total_budget: 260,
      league_scope: "NL",
      drafted_players: [],
      pre_draft_rosters: {
        team_1: [{ player_id: "k", name: "K", team_id: "team_1" }],
      },
    });
    expect(parsed.pre_draft_rosters).toEqual({
      team_1: [{ player_id: "k", name: "K", team_id: "team_1" }],
    });
  });
});

describe("valuationIncomingSchema", () => {
  it("parses nested fixture as format nested", () => {
    const parsed = valuationIncomingSchema.parse({
      schemaVersion: "1.0.0",
      checkpoint: "pre_draft",
      league: minimalLeague,
      draft_state: [],
    });
    expect(parsed.format).toBe("nested");
    expect(parsed.data.checkpoint).toBe("pre_draft");
  });

  it("parses flat body as format flat", () => {
    const parsed = valuationIncomingSchema.parse({
      roster_slots: { OF: 1 },
      scoring_categories: [{ name: "HR", type: "batting" }],
      total_budget: 260,
      league_scope: "AL",
      drafted_players: [],
      schema_version: "1.0.0",
    });
    expect(parsed.format).toBe("flat");
    if (parsed.format === "flat") {
      expect(parsed.data.league_scope).toBe("AL");
    }
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
