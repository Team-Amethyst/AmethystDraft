import { z } from "zod";

const checkpointSchema = z.enum([
  "pre_draft",
  "after_pick_10",
  "after_pick_50",
  "after_pick_100",
  "after_pick_130",
]);

const scoringCategorySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["batting", "pitching"]),
});

const rosterSlotsInputSchema = z.union([
  z.array(
    z.object({
      position: z.string().min(1),
      count: z.number().int().min(0),
    }),
  ),
  z.record(z.string(), z.number().int().min(0)),
]);

export type RosterSlotsNormalized = { position: string; count: number }[];

/** Normalize roster_slots to engine array shape. */
export function normalizeRosterSlots(
  input: z.infer<typeof rosterSlotsInputSchema>,
): RosterSlotsNormalized {
  return Array.isArray(input)
    ? input
    : Object.entries(input).map(([position, count]) => ({ position, count }));
}

const rosteredPlayerSchema = z.object({
  player_id: z.string().min(1),
  name: z.string().min(1),
  positions: z.array(z.string()).optional(),
  team: z.string().optional(),
  team_id: z.string().min(1),
  paid: z.number().min(0).optional(),
  is_keeper: z.boolean().optional(),
  roster_slot: z.string().optional(),
});

const draftPickSchema = rosteredPlayerSchema.extend({
  pick_number: z.number().int().min(1).optional(),
});

const teamPlayersSectionSchema = z.object({
  team_id: z.string().min(1),
  players: z.array(rosteredPlayerSchema),
});

const leagueFixtureSchema = z.object({
  roster_slots: rosterSlotsInputSchema,
  scoring_categories: z.array(scoringCategorySchema),
  total_budget: z.number().positive(),
  num_teams: z.number().int().min(2),
  league_scope: z.enum(["Mixed", "AL", "NL"]),
  scoring_format: z.enum(["5x5", "6x6", "points"]).optional(),
  hitter_budget_pct: z.number().min(0).max(100).optional(),
  pos_eligibility_threshold: z.number().int().min(1).max(162).optional(),
  budget_by_team_id: z.record(z.string(), z.number().min(0)).optional(),
});

/**
 * Versioned valuation fixture for Player API testing (Activity #9) and engine proxy.
 * JSON Schema: apps/api/schemas/valuation-request.v1.schema.json
 */
export const valuationRequestSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  checkpoint: checkpointSchema,
  league: leagueFixtureSchema,
  draft_state: z.array(draftPickSchema),
  pre_draft_rosters: z.array(teamPlayersSectionSchema).optional(),
  minors: z.array(teamPlayersSectionSchema).optional(),
  taxi: z.array(teamPlayersSectionSchema).optional(),
  deterministic: z.boolean().optional(),
  seed: z.number().int().optional(),
});

export type ValuationRequestFixture = z.infer<typeof valuationRequestSchema>;
export type DraftPickFixture = z.infer<typeof draftPickSchema>;
export type RosteredPlayerFixture = z.infer<typeof rosteredPlayerSchema>;
