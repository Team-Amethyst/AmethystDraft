import type { ILeague } from "../models/League";
import type { IRosterEntry } from "../models/RosterEntry";
import {
  normalizeRosterSlots,
  type ValuationRequestFixture,
  type ValuationFlatRequest,
  type ValuationIncomingParsed,
  type RosterSlotsNormalized,
} from "../validation/valuationRequestSchema";

export interface EngineRosterSlot {
  position: string;
  count: number;
}

export interface EngineScoringCategory {
  name: string;
  type: "batting" | "pitching";
}

export interface EngineDraftedPlayer {
  player_id: string;
  name: string;
  position: string;
  team: string;
  team_id: string;
  paid?: number;
  /** Full eligibility when known; engine may use for scarcity. */
  positions?: string[];
  is_keeper?: boolean;
  roster_slot?: string;
  pick_number?: number;
}

/** Payload for POST /valuation/calculate (extends legacy fields; engine may ignore unknown keys). */
export interface EngineValuationContext {
  roster_slots: EngineRosterSlot[];
  scoring_categories: EngineScoringCategory[];
  total_budget: number;
  num_teams: number;
  league_scope: "Mixed" | "AL" | "NL";
  drafted_players: EngineDraftedPlayer[];
  schema_version?: string;
  checkpoint?: string;
  budget_by_team_id?: Record<string, number>;
  scoring_format?: "5x5" | "6x6" | "points";
  hitter_budget_pct?: number;
  pos_eligibility_threshold?: number;
  minors?: EngineTeamPlayersSection[];
  taxi?: EngineTeamPlayersSection[];
  /** Engine: optional subset of undrafted ids to value. */
  player_ids?: string[];
  /**
   * Pre-auction rosters (keepers); Engine validates, may ignore for v1 inflation.
   * Nested fixtures use team sections; flat may use record keyed by team_id.
   */
  pre_draft_rosters?:
    | EngineTeamPlayersSection[]
    | Record<string, EngineRosterOnlyPlayer[]>;
  /** Duplicate of schema_version for Engine merge (camelCase). */
  schemaVersion?: string;
  deterministic?: boolean;
  seed?: number;
  user_team_id?: string;
  inflation_model?: "replacement_slots_v2";
}

export interface EngineTeamPlayersSection {
  team_id: string;
  players: EngineRosterOnlyPlayer[];
}

/** Player on roster without implying an auction pick (minors / taxi / optional pre-draft mirror). */
export interface EngineRosterOnlyPlayer {
  player_id: string;
  name: string;
  positions?: string[];
  team?: string;
  team_id: string;
  paid?: number;
  is_keeper?: boolean;
  roster_slot?: string;
}

export interface EngineScarcityContext {
  drafted_players: EngineDraftedPlayer[];
  scoring_categories: EngineScoringCategory[];
  num_teams: number;
  league_scope: "Mixed" | "AL" | "NL";
  position?: string;
}

export interface EngineTeamState {
  team_id: string;
  budget_remaining: number;
  roster: EngineDraftedPlayer[];
}

export interface EngineSimulationContext {
  pick_order: string[];
  roster_slots: EngineRosterSlot[];
  league_scope: "Mixed" | "AL" | "NL";
  teams: EngineTeamState[];
  available_player_ids?: string[];
}

/**
 * Converts stored roster entries to the DraftedPlayer shape the engine expects.
 * team_id is derived from the player's teamId field (set at draft time).
 */
function toDraftedPlayers(entries: IRosterEntry[]): EngineDraftedPlayer[] {
  return entries.map((e) => {
    const position = e.positions[0] ?? e.rosterSlot;
    return {
      player_id: String(e.externalPlayerId),
      name: e.playerName,
      position,
      team: e.playerTeam,
      team_id: e.teamId,
      paid: e.price,
      ...(e.positions.length ? { positions: [...e.positions] } : {}),
      ...(e.isKeeper ? { is_keeper: true } : {}),
      roster_slot: e.rosterSlot,
    };
  });
}

function isMinorSlot(slot: string | undefined): boolean {
  const normalized = (slot ?? "").toUpperCase();
  return normalized.includes("MIN");
}

function isTaxiSlot(slot: string | undefined): boolean {
  const normalized = (slot ?? "").toUpperCase();
  return normalized.includes("TAXI");
}

function toTeamPlayersSections(
  entries: IRosterEntry[],
): EngineTeamPlayersSection[] {
  const byTeam = new Map<string, EngineRosterOnlyPlayer[]>();
  for (const e of entries) {
    const rows = byTeam.get(e.teamId) ?? [];
    rows.push({
      player_id: String(e.externalPlayerId),
      name: e.playerName,
      positions: e.positions.length ? [...e.positions] : undefined,
      team: e.playerTeam,
      team_id: e.teamId,
      paid: e.price,
      is_keeper: e.isKeeper,
      roster_slot: e.rosterSlot,
    });
    byTeam.set(e.teamId, rows);
  }
  return [...byTeam.entries()].map(([team_id, players]) => ({
    team_id,
    players,
  }));
}

/** Remaining budget per team: total_budget − sum(paid) for players on that team. */
export function computeBudgetByTeamRemaining(
  totalBudget: number,
  draftedPlayers: EngineDraftedPlayer[],
  numTeams: number,
): Record<string, number> {
  const spent: Record<string, number> = {};
  for (const p of draftedPlayers) {
    const tid = p.team_id;
    spent[tid] = (spent[tid] ?? 0) + (p.paid ?? 0);
  }

  const teamIds = new Set<string>();
  for (let i = 1; i <= numTeams; i++) {
    teamIds.add(`team_${i}`);
  }
  for (const p of draftedPlayers) {
    teamIds.add(p.team_id);
  }

  const out: Record<string, number> = {};
  for (const tid of teamIds) {
    out[tid] = totalBudget - (spent[tid] ?? 0);
  }
  return out;
}

/**
 * Engine roster_slots: always `{ position, count }[]` with integer counts.
 * League.rosterSlots is `Mixed` in Mongo — it may be a plain record or an array
 * of `{ position, count }`. Using Object.entries on an array produces bogus rows
 * ("0", { position: "C", count: 1 }) and breaks downstream capacity math.
 */
export function leagueRosterSlotsForEngine(league: ILeague): EngineRosterSlot[] {
  const raw = league.rosterSlots as unknown;
  if (raw == null || typeof raw !== "object") return [];
  const normalized: RosterSlotsNormalized = normalizeRosterSlots(
    raw as Parameters<typeof normalizeRosterSlots>[0],
  );
  return normalized
    .map((row) => ({
      position: String(row.position),
      count: Math.max(
        0,
        Math.floor(
          typeof row.count === "number"
            ? row.count
            : Number(row.count as unknown) || 0,
        ),
      ),
    }))
    .filter((row) => row.position.length > 0);
}

/** Canonical team count for engine payloads when `teams` is missing or invalid. */
export function resolveLeagueNumTeams(league: ILeague): number {
  const explicit = Number(league.teams);
  if (Number.isFinite(explicit) && explicit >= 2) {
    return Math.floor(explicit);
  }
  const nameLen = Array.isArray(league.teamNames) ? league.teamNames.length : 0;
  if (nameLen >= 2) return nameLen;
  const memberLen = league.memberIds?.length ?? 0;
  if (memberLen >= 2) return memberLen;
  return 12;
}

function countSectionPlayers(
  sections: EngineTeamPlayersSection[] | undefined,
): number {
  if (!sections?.length) return 0;
  return sections.reduce((n, s) => n + (s.players?.length ?? 0), 0);
}

/** Structured summary for LOG_ENGINE_VALUATION_DEBUG=1 (exact POST body is logged separately). */
export function summarizeEngineValuationPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const drafted = (payload.drafted_players as EngineDraftedPlayer[]) ?? [];
  const roster_slots = (payload.roster_slots as EngineRosterSlot[]) ?? [];
  const slotSum = roster_slots.reduce(
    (s, r) => s + (typeof r.count === "number" && Number.isFinite(r.count) ? r.count : 0),
    0,
  );
  const bb = payload.budget_by_team_id as Record<string, number> | undefined;
  let budget_by_team_id_sum: number | null = null;
  if (bb && typeof bb === "object") {
    let s = 0;
    for (const v of Object.values(bb)) {
      if (typeof v === "number" && Number.isFinite(v)) s += v;
    }
    budget_by_team_id_sum = s;
  }

  return {
    drafted_players_length: drafted.length,
    drafted_players_first_20: drafted.slice(0, 20),
    pre_draft_rosters_player_count: countSectionPlayers(
      payload.pre_draft_rosters as EngineTeamPlayersSection[] | undefined,
    ),
    minors_player_count: countSectionPlayers(
      payload.minors as EngineTeamPlayersSection[] | undefined,
    ),
    taxi_player_count: countSectionPlayers(
      payload.taxi as EngineTeamPlayersSection[] | undefined,
    ),
    roster_slots,
    roster_slot_count_sum: slotSum,
    num_teams: payload.num_teams,
    total_budget: payload.total_budget,
    budget_by_team_id: payload.budget_by_team_id,
    budget_by_team_id_sum,
    inflation_model: payload.inflation_model,
    user_team_id: payload.user_team_id,
  };
}

/** Set LOG_ENGINE_VALUATION_DEBUG=1 on the API to log the exact engine POST body and a summary. */
export function logEngineValuationPayloadIfEnabled(
  payload: Record<string, unknown>,
): void {
  if (process.env.LOG_ENGINE_VALUATION_DEBUG !== "1") return;
  console.info(
    "[engine-valuation] POST /valuation/calculate body:",
    JSON.stringify(payload),
  );
  console.info(
    "[engine-valuation] summary:",
    JSON.stringify(summarizeEngineValuationPayload(payload)),
  );
}

/** Picks useful top-level / nested keys from Engine JSON (schemas vary by Engine version). */
export function pickEngineValuationResponseDebug(
  data: unknown,
): Record<string, unknown> {
  const d =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : {};
  const v2 = d.context_v2;
  const market =
    v2 && typeof v2 === "object"
      ? ((v2 as Record<string, unknown>).market_summary as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const vals = d.valuations;
  const valuationsLength = Array.isArray(vals) ? vals.length : null;
  const pick = (k: string) => (Object.prototype.hasOwnProperty.call(d, k) ? d[k] : undefined);

  return {
    valuations_length: valuationsLength,
    players_remaining: d.players_remaining,
    total_budget_remaining: d.total_budget_remaining,
    inflation_factor: d.inflation_factor,
    pool_value_remaining: d.pool_value_remaining,
    remaining_slots: pick("remaining_slots"),
    players_left: pick("players_left"),
    draftable_pool_size: pick("draftable_pool_size"),
    inflation_raw: pick("inflation_raw"),
    inflation_bounded_by: pick("inflation_bounded_by"),
    context_v2_market_summary: market,
  };
}

export function logEngineValuationResponseIfEnabled(data: unknown): void {
  if (process.env.LOG_ENGINE_VALUATION_DEBUG !== "1") return;
  console.info(
    "[engine-valuation] response pick:",
    JSON.stringify(pickEngineValuationResponseDebug(data)),
  );
}

/**
 * Builds the full context object for /valuation/calculate and /analysis/scarcity.
 *
 * Player stat lines (`stats`, `stats3yr`, `projection` on catalog) are for the
 * Amethyst MLB catalog and research UI only. The upstream engine ingests its own
 * player features from the ids and league rules in this payload; keep catalog
 * season definitions aligned with engine release notes when changing MLB season math.
 */
export function buildValuationContext(
  league: ILeague,
  rosterEntries: IRosterEntry[],
  options?: { userTeamId?: string },
): EngineValuationContext {
  const rosterSlots = leagueRosterSlotsForEngine(league);
  const numTeams = resolveLeagueNumTeams(league);

  const keeperEntries = rosterEntries.filter((e) => e.isKeeper);
  const minorsEntries = rosterEntries.filter((e) => isMinorSlot(e.rosterSlot));
  const taxiEntries = rosterEntries.filter((e) => isTaxiSlot(e.rosterSlot));
  const draftedEntries = rosterEntries.filter(
    (e) => !e.isKeeper && !isMinorSlot(e.rosterSlot) && !isTaxiSlot(e.rosterSlot),
  );
  const drafted_players = toDraftedPlayers(draftedEntries);

  return {
    roster_slots: rosterSlots,
    scoring_categories: league.scoringCategories,
    total_budget: league.budget,
    num_teams: numTeams,
    league_scope: league.playerPool,
    drafted_players,
    budget_by_team_id: computeBudgetByTeamRemaining(
      league.budget,
      drafted_players,
      numTeams,
    ),
    ...(league.scoringFormat
      ? { scoring_format: league.scoringFormat }
      : {}),
    ...(league.hitterBudgetPct !== undefined
      ? { hitter_budget_pct: league.hitterBudgetPct }
      : {}),
    ...(league.posEligibilityThreshold !== undefined
      ? { pos_eligibility_threshold: league.posEligibilityThreshold }
      : {}),
    user_team_id: options?.userTeamId ?? "team_1",
    inflation_model: "replacement_slots_v2",
    pre_draft_rosters: toTeamPlayersSections(keeperEntries),
    minors: toTeamPlayersSections(minorsEntries),
    taxi: toTeamPlayersSections(taxiEntries),
  };
}

/**
 * Builds the context for /simulation/mock-pick.
 * budgetByTeamId maps team_id → budget_remaining (pass current auction state).
 */
export function buildSimulationContext(
  league: ILeague,
  rosterEntries: IRosterEntry[],
  budgetByTeamId: Record<string, number>,
  availablePlayerIds?: string[],
): EngineSimulationContext {
  const rosterSlots = leagueRosterSlotsForEngine(league);

  const teamIds = league.memberIds.map((_, i) => `team_${i + 1}`);

  const teams: EngineTeamState[] = teamIds.map((teamId) => {
    const teamRoster = rosterEntries.filter((e) => e.teamId === teamId);
    return {
      team_id: teamId,
      budget_remaining: budgetByTeamId[teamId] ?? league.budget,
      roster: toDraftedPlayers(teamRoster),
    };
  });

  return {
    pick_order: teamIds,
    roster_slots: rosterSlots,
    league_scope: league.playerPool,
    teams,
    ...(availablePlayerIds ? { available_player_ids: availablePlayerIds } : {}),
  };
}

/**
 * Builds the context for /analysis/scarcity.
 * Optionally filter to a single position.
 */
export function buildScarcityContext(
  league: ILeague,
  rosterEntries: IRosterEntry[],
  position?: string,
): EngineScarcityContext {
  return {
    drafted_players: toDraftedPlayers(rosterEntries),
    scoring_categories: league.scoringCategories,
    num_teams: resolveLeagueNumTeams(league),
    league_scope: league.playerPool,
    ...(position ? { position } : {}),
  };
}

/**
 * Derives team_id from a userId string and the league's memberIds array.
 * This is the canonical conversion used everywhere.
 * @throws Error if userId is not found in memberIds
 */
export function userIdToTeamId(
  userId: string,
  memberIds: { toString(): string }[],
): string {
  const index = memberIds.findIndex((id) => id.toString() === userId);
  if (index < 0) {
    throw new Error(`User ${userId} is not a member of this league`);
  }
  return `team_${index + 1}`;
}

function fixtureRowToDraftedPlayer(
  p: {
    player_id: string;
    name: string;
    position?: string;
    positions?: string[];
    team?: string;
    team_id: string;
    paid?: number;
    is_keeper?: boolean;
    roster_slot?: string;
    pick_number?: number;
  },
): EngineDraftedPlayer {
  const position =
    p.position ?? p.positions?.[0] ?? p.roster_slot ?? "UTIL";
  return {
    player_id: p.player_id,
    name: p.name,
    position,
    team: p.team ?? "",
    team_id: p.team_id,
    ...(p.paid !== undefined ? { paid: p.paid } : {}),
    ...(p.positions?.length ? { positions: p.positions } : {}),
    ...(p.is_keeper !== undefined ? { is_keeper: p.is_keeper } : {}),
    ...(p.roster_slot !== undefined ? { roster_slot: p.roster_slot } : {}),
    ...(p.pick_number !== undefined ? { pick_number: p.pick_number } : {}),
  };
}

function flattenPreDraftRosters(
  sections: ValuationRequestFixture["pre_draft_rosters"],
): EngineDraftedPlayer[] {
  if (!sections?.length) return [];
  return sections.flatMap((section) =>
    section.players.map((pl) =>
      fixtureRowToDraftedPlayer({
        ...pl,
        team_id: pl.team_id || section.team_id,
      }),
    ),
  );
}

function flattenFlexiblePreDraft(
  pre: ValuationFlatRequest["pre_draft_rosters"],
): EngineDraftedPlayer[] {
  if (!pre) return [];
  if (Array.isArray(pre)) {
    return flattenPreDraftRosters(pre);
  }
  const out: EngineDraftedPlayer[] = [];
  for (const [sectionTeamId, players] of Object.entries(pre)) {
    for (const pl of players) {
      out.push(
        fixtureRowToDraftedPlayer({
          ...pl,
          team_id: pl.team_id || sectionTeamId,
        }),
      );
    }
  }
  return out;
}

/**
 * Strips undefined, mirrors `schema_version` → `schemaVersion` for Engine merge rules.
 */
export function finalizeEngineValuationPostPayload(
  body: EngineValuationContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  if (body.schema_version !== undefined && out.schemaVersion === undefined) {
    out.schemaVersion = body.schema_version;
  }
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) {
      delete out[key];
    }
  }
  return out;
}

/**
 * Maps an Activity #9 nested fixture to the Engine flat valuation body.
 * `drafted_players` = auction picks only; `pre_draft_rosters` passed separately when present.
 * `budget_by_team_id` (when computed here) uses keeper + auction spend so remaining $ stays correct.
 */
export function buildEngineValuationCalculateBodyFromFixture(
  fixture: ValuationRequestFixture,
): EngineValuationContext {
  const { league } = fixture;
  const roster_slots = normalizeRosterSlots(league.roster_slots);

  const preDraftFlattened = flattenPreDraftRosters(fixture.pre_draft_rosters);
  const auctionPicks = fixture.draft_state.map((p) =>
    fixtureRowToDraftedPlayer(p),
  );
  const drafted_players = auctionPicks;
  const budgetRows = [...preDraftFlattened, ...auctionPicks];

  const budget_by_team_id =
    league.budget_by_team_id ??
    computeBudgetByTeamRemaining(
      league.total_budget,
      budgetRows,
      league.num_teams,
    );

  const body: EngineValuationContext = {
    roster_slots,
    scoring_categories: league.scoring_categories,
    total_budget: league.total_budget,
    num_teams: league.num_teams,
    league_scope: league.league_scope,
    drafted_players,
    schema_version: fixture.schemaVersion,
    checkpoint: fixture.checkpoint,
    budget_by_team_id,
    ...(league.scoring_format !== undefined
      ? { scoring_format: league.scoring_format }
      : {}),
    ...(league.hitter_budget_pct !== undefined
      ? { hitter_budget_pct: league.hitter_budget_pct }
      : {}),
    ...(league.pos_eligibility_threshold !== undefined
      ? { pos_eligibility_threshold: league.pos_eligibility_threshold }
      : {}),
    ...(fixture.pre_draft_rosters?.length
      ? { pre_draft_rosters: fixture.pre_draft_rosters }
      : {}),
    ...(fixture.minors?.length ? { minors: fixture.minors } : {}),
    ...(fixture.taxi?.length ? { taxi: fixture.taxi } : {}),
    ...(fixture.player_ids?.length ? { player_ids: fixture.player_ids } : {}),
    ...(fixture.deterministic !== undefined
      ? { deterministic: fixture.deterministic }
      : {}),
    ...(fixture.seed !== undefined ? { seed: fixture.seed } : {}),
    user_team_id: fixture.user_team_id ?? fixture.league.user_team_id ?? "team_1",
    inflation_model:
      fixture.inflation_model ?? fixture.league.inflation_model ?? "replacement_slots_v2",
  };

  return body;
}

/** Preferred flat valuation body from Draft / graders (matches Engine contract). */
export function buildEngineValuationCalculateBodyFromFlat(
  flat: ValuationFlatRequest,
): EngineValuationContext {
  const roster_slots = normalizeRosterSlots(flat.roster_slots);
  const num_teams = flat.num_teams;
  const drafted_players = flat.drafted_players.map((p) =>
    fixtureRowToDraftedPlayer(p),
  );
  const preBudget = flattenFlexiblePreDraft(flat.pre_draft_rosters);
  const budgetRows = [...preBudget, ...drafted_players];

  const budget_by_team_id =
    flat.budget_by_team_id && Object.keys(flat.budget_by_team_id).length > 0
      ? flat.budget_by_team_id
      : computeBudgetByTeamRemaining(
          flat.total_budget,
          budgetRows,
          num_teams,
        );

  const mergedSchema =
    flat.schema_version ?? flat.schemaVersion ?? undefined;

  const body: EngineValuationContext = {
    roster_slots,
    scoring_categories: flat.scoring_categories,
    total_budget: flat.total_budget,
    num_teams,
    league_scope: flat.league_scope,
    drafted_players,
    ...(mergedSchema !== undefined ? { schema_version: mergedSchema } : {}),
    ...(flat.checkpoint !== undefined ? { checkpoint: flat.checkpoint } : {}),
    budget_by_team_id,
    ...(flat.scoring_format !== undefined
      ? { scoring_format: flat.scoring_format }
      : {}),
    ...(flat.hitter_budget_pct !== undefined
      ? { hitter_budget_pct: flat.hitter_budget_pct }
      : {}),
    ...(flat.pos_eligibility_threshold !== undefined
      ? { pos_eligibility_threshold: flat.pos_eligibility_threshold }
      : {}),
    ...(flat.pre_draft_rosters !== undefined
      ? { pre_draft_rosters: flat.pre_draft_rosters }
      : {}),
    ...(flat.minors?.length ? { minors: flat.minors } : {}),
    ...(flat.taxi?.length ? { taxi: flat.taxi } : {}),
    ...(flat.player_ids?.length ? { player_ids: flat.player_ids } : {}),
    ...(flat.deterministic !== undefined
      ? { deterministic: flat.deterministic }
      : {}),
    ...(flat.seed !== undefined ? { seed: flat.seed } : {}),
    user_team_id: flat.user_team_id ?? "team_1",
    inflation_model: flat.inflation_model ?? "replacement_slots_v2",
  };

  return body;
}

export function valuationIncomingToEngineContext(
  parsed: ValuationIncomingParsed,
): EngineValuationContext {
  if (parsed.format === "nested") {
    return buildEngineValuationCalculateBodyFromFixture(parsed.data);
  }
  return buildEngineValuationCalculateBodyFromFlat(parsed.data);
}
