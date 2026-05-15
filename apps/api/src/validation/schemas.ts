import { z } from "zod";

const currentYear = new Date().getFullYear();

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const loginSchema = z.object({
  email: z.string().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required").optional(),
  email: z.string().email("Invalid email address").optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

// Password-confirmed deletion schema (kept for quick restore):
// export const deleteAccountSchema = z.object({
//   currentPassword: z.string().min(1, "Current password is required"),
// });

export const resetPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  token: z.string().min(1, "Reset token is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

// ─── Leagues ──────────────────────────────────────────────────────────────────

const scoringCategorySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["batting", "pitching"]),
});

const playerPoolSchema = z.enum(["Mixed", "AL", "NL"]);

const playerPoolQuerySchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;

  const normalized = value.trim().toLowerCase();
  if (normalized === "mixed" || normalized === "mixed mlb") return "Mixed";
  if (normalized === "al" || normalized === "al-only" || normalized === "al only") {
    return "AL";
  }
  if (normalized === "nl" || normalized === "nl-only" || normalized === "nl only") {
    return "NL";
  }

  return value;
}, playerPoolSchema.optional());

export const createLeagueSchema = z.object({
  name: z.string().trim().min(1, "League name is required"),
  seasonYear: z.number().int().min(1900).max(currentYear, "Season year cannot be in the future").optional(),
  teams: z.number().int().min(2).max(30).optional(),
  budget: z.number().positive().optional(),
  hitterBudgetPct: z.number().min(0).max(100).optional(),
  rosterSlots: z.record(z.string(), z.number().int().min(0)).optional(),
  scoringFormat: z.enum(["5x5", "6x6", "points"]).optional(),
  scoringCategories: z.array(scoringCategorySchema).optional(),
  playerPool: playerPoolSchema.optional(),
  draftDate: z.string().optional(),
  teamNames: z.array(z.string()).optional(),
  posEligibilityThreshold: z.number().int().min(1).optional(),
});

export const updateLeagueSchema = createLeagueSchema.partial();

// ─── Taxi Draft ───────────────────────────────────────────────────────────────

export const updateTaxiDraftOrderSchema = z.object({
  taxiDraftOrder: z.array(z.string()),
});

export const updateTaxiRostersSchema = z.object({
  taxiRosters: z.record(z.string(), z.array(z.object({
    playerId: z.string(),
    teamId: z.string(),
    addedAt: z.string(),
    pickNumber: z.number().optional(),
  }))),
});

// ─── Roster ───────────────────────────────────────────────────────────────────

export const addRosterEntrySchema = z.object({
  externalPlayerId: z.string().min(1, "Player ID is required"),
  playerName: z.string().min(1, "Player name is required"),
  playerTeam: z.string().optional(),
  positions: z.array(z.string()).optional(),
  price: z.number().int().min(1, "Price must be at least $1"),
  rosterSlot: z.string().min(1, "Roster slot is required"),
  isKeeper: z.boolean().optional(),
  keeperContract: z.string().trim().max(40).optional(),
  userId: z.string().optional(),
  teamId: z.string().optional(),
});

// ─── Engine ───────────────────────────────────────────────────────────────────

export const mockPickSchema = z.object({
  budgetByTeamId: z.record(z.string(), z.number().min(0)).default({}),
  availablePlayerIds: z.array(z.string()).optional(),
});

export const newsSignalsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).optional(),
  signal_type: z.string().min(1).optional(),
});

/** Body for POST …/leagues/:leagueId/valuation — forwarded fields merged into Engine payload. */
export const valuationBoardBodySchema = z.object({
  user_team_id: z.string().min(1).optional(),
  inflation_model: z.enum(["replacement_slots_v2"]).optional(),
  explain_valuation_rows: z.boolean().optional(),
  recommended_bid_soft_cap_ratio: z.number().finite().positive().max(10).optional(),
});

/** Body for POST …/valuation/player — merged with league valuation context for Engine. */
export const valuationPlayerBodySchema = z.object({
  player_id: z.string().min(1, "player_id is required"),
  user_team_id: z.string().min(1).optional(),
  inflation_model: z.enum(["replacement_slots_v2"]).optional(),
  explain_valuation_rows: z.boolean().optional(),
  recommended_bid_soft_cap_ratio: z.number().finite().positive().max(10).optional(),
});

/** Body for POST …/catalog/batch-values — forwarded to Engine catalog route. */
export const catalogBatchValuesBodySchema = z.object({
  player_ids: z.array(z.string().min(1)).min(1, "At least one player_id is required"),
  league_scope: playerPoolSchema.optional(),
  pos_eligibility_threshold: z.number().optional(),
});

export const playersQuerySchema = z.object({
  sortBy: z
    .enum(["adp", "catalog_rank", "value", "name", "market_adp"])
    .optional(),
  playerPool: playerPoolQuerySchema,
  posEligibilityThreshold: z.coerce.number().int().min(0).max(162).optional(),
});

export {
  valuationRequestSchema,
  valuationFlatRequestSchema,
  valuationIncomingSchema,
  normalizeRosterSlots,
  engineSchemaVersionString,
} from "./valuationRequestSchema";
export type {
  ValuationRequestFixture,
  ValuationFlatRequest,
  ValuationIncomingParsed,
} from "./valuationRequestSchema";
