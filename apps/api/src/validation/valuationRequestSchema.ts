import { z } from "zod";

/** Engine allows merged major 0 or 1; major ≥ 2 rejected by Engine. */
export const engineSchemaVersionString = z
  .string()
  .min(1)
  .refine(
    (v) => {
      const major = Number.parseInt(v.split(".")[0] ?? "", 10);
      return major === 0 || major === 1;
    },
    { message: "schema version major must be 0 or 1" },
  );

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
  position: z.string().optional(),
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

const preDraftRostersFlexibleSchema = z.union([
  z.array(teamPlayersSectionSchema),
  z.record(z.string(), z.array(rosteredPlayerSchema)),
]);

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
  user_team_id: z.string().min(1).optional(),
  inflation_model: z.enum(["replacement_slots_v2"]).optional(),
});

/**
 * Activity #9 nested fixture: `league` + `draft_state` (auction picks only).
 * Pre-draft keepers live in `pre_draft_rosters` (Engine may ignore for v1 inflation).
 */
export const valuationRequestSchema = z.object({
  schemaVersion: engineSchemaVersionString,
  checkpoint: checkpointSchema,
  league: leagueFixtureSchema,
  draft_state: z.array(draftPickSchema),
  pre_draft_rosters: z.array(teamPlayersSectionSchema).optional(),
  minors: z.array(teamPlayersSectionSchema).optional(),
  taxi: z.array(teamPlayersSectionSchema).optional(),
  player_ids: z.array(z.string().min(1)).optional(),
  deterministic: z.boolean().optional(),
  seed: z.number().int().optional(),
  user_team_id: z.string().min(1).optional(),
  inflation_model: z.enum(["replacement_slots_v2"]).optional(),
});

export type ValuationRequestFixture = z.infer<typeof valuationRequestSchema>;

/**
 * Preferred Engine / Draft flat body (plus optional camelCase schemaVersion).
 */
export const valuationFlatRequestSchema = z.object({
  roster_slots: rosterSlotsInputSchema,
  scoring_categories: z.array(scoringCategorySchema),
  total_budget: z.number().positive(),
  num_teams: z.number().int().min(2).optional().default(12),
  league_scope: z.enum(["Mixed", "AL", "NL"]),
  drafted_players: z.array(draftPickSchema),
  schema_version: z.string().optional(),
  schemaVersion: engineSchemaVersionString.optional(),
  checkpoint: checkpointSchema.optional(),
  budget_by_team_id: z.record(z.string(), z.number().min(0)).optional(),
  scoring_format: z.enum(["5x5", "6x6", "points"]).optional(),
  hitter_budget_pct: z.number().min(0).max(100).optional(),
  pos_eligibility_threshold: z.number().int().min(1).max(162).optional(),
  minors: z.array(teamPlayersSectionSchema).optional(),
  taxi: z.array(teamPlayersSectionSchema).optional(),
  pre_draft_rosters: preDraftRostersFlexibleSchema.optional(),
  player_ids: z.array(z.string().min(1)).optional(),
  deterministic: z.boolean().optional(),
  seed: z.number().int().optional(),
  user_team_id: z.string().min(1).optional(),
  inflation_model: z.enum(["replacement_slots_v2"]).optional(),
});

export type ValuationFlatRequest = z.infer<typeof valuationFlatRequestSchema>;

/**
 * Nested (Activity #9) first — requires `league`; otherwise flat valuation body.
 */
export const valuationIncomingSchema = z.union([
  valuationRequestSchema.transform((data) => ({ format: "nested" as const, data })),
  valuationFlatRequestSchema.transform((data) => ({ format: "flat" as const, data })),
]);

export type ValuationIncomingParsed = z.infer<typeof valuationIncomingSchema>;

export type DraftPickFixture = z.infer<typeof draftPickSchema>;
export type RosteredPlayerFixture = z.infer<typeof rosteredPlayerSchema>;
