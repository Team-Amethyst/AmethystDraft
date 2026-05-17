import type { Player } from "../types/player";
import type { ValuationExplain, ValuationResult } from "../api/engine";
import type { League } from "../contexts/LeagueContext";
import type { RosterEntry } from "../api/roster";
import { rosterSlotsToRecord } from "../pages/command-center-utils/roster";
import { filterActiveAuctionEntries } from "../pages/command-center-utils/roster";
import { teamRosterSlotCounts } from "../pages/command-center-utils/rosterAssignment";

export type ValuationSortField =
  | "auction_value"
  | "team_value"
  | "recommended_bid"
  | "baseline_value";

export interface ValuationShape {
  player_id: string;
  /** Legacy Engine row tier (auction-relative); prefer auction_tier when present. */
  tier?: number;
  auction_tier?: number;
  baseline_tier?: number;
  auction_rank?: number;
  baseline_rank?: number;
  market_adp?: number;
  market_adp_source?: string;
  market_adp_updated_at?: string;
  market_adp_min?: number;
  market_adp_max?: number;
  market_pick_count?: number;
  /** Legacy auction-rank slot on some payloads; prefer auction_rank. */
  adp?: number;
  baseline_value?: number;
  auction_value?: number;
  recommended_bid?: number;
  max_bid?: number;
  team_value?: number;
  edge?: number;
  inflation_model?: "replacement_slots_v2";
  indicator?: "Steal" | "Reach" | "Fair Value";
  explain_v2?: Player["explain_v2"];
  why?: string[];
  market_notes?: string[];
  valuation_explain?: Player["valuation_explain"];
  recommended_bid_note?: string;
  edge_note?: string;
}

/** Separates league fair value from bid guidance in modals. */
export const RECOMMENDED_BID_VS_AUCTION_VALUE_COPY =
  "Suggested bid is the actionable offer for your roster—not league-wide fair market value. It can run above league FMV when your team needs the fit; max bid is the hard ceiling.";

/** Research `PlayerTable` footer: Research rows show Auction Value only; open a player for the rest. */
export const RESEARCH_TABLE_FOOTER_OPEN_PLAYER_LADDER_COPY =
  "Open a player for league FMV, suggested bid, your team value, bid edge, max bid, and baseline strength under Why this value.";

/** Research `PlayerTable` value column: full hover copy (scanning table, not the explain surface). */
export const RESEARCH_TABLE_TOOLTIP_AUCTION_VALUE =
  "League fair market value (FMV): what this player is worth league-wide in auction dollars—same as Auction Value in the engine. Not your bid cap.";

export const RESEARCH_TABLE_TOOLTIP_MAX_BID =
  "Max bid: hard stop for this player given your remaining budget and open roster slots (not the same as recommended bid).";

/** Team Value: roster- and budget-specific worth to your team. */
export const RESEARCH_TABLE_TOOLTIP_TEAM_VALUE =
  "Your team value: what this player is worth to your roster given needs, inflation, and remaining budget—often differs from league FMV.";

/** Bid Edge (Team Value − Recommended bid). */
export const BID_EDGE_TOOLTIP =
  "Bid edge = your team value minus suggested bid. Positive means room if you pay the suggested offer; zero means the bid uses your full team value.";

/** @deprecated Use {@link BID_EDGE_TOOLTIP}. */
export const RESEARCH_TABLE_EDGE_SURPLUS_VS_MAX_TOOLTIP = BID_EDGE_TOOLTIP;

/** @deprecated Product UI uses {@link BID_EDGE_TOOLTIP} (Team Value − recommended bid). */
export const ROSTER_EDGE_TOOLTIP =
  "Roster Edge = Team Value minus Auction Value.";

/** Pre-auction strength basis (`baseline_value`); not a spendable bid value. */
export const BASELINE_STRENGTH_TOOLTIP =
  "Baseline Strength is the player's pre-auction model strength before replacement levels and budget allocation.";

/**
 * `valuation_explain.replacement_key_used`: surplus comparison slot from Engine, not role label.
 */
export const REPLACEMENT_COMPARISON_SLOT_TOOLTIP =
  "The roster slot whose replacement value is used to calculate this player's surplus. This is not necessarily the player's real-life role.";

export const VALUATION_FALLBACK_ORDER: ValuationSortField[] = [
  "auction_value",
  "team_value",
  "recommended_bid",
  "baseline_value",
];

/**
 * League-wide canonical auction dollars (`auction_value` from the valuation contract).
 */
export function leagueWideAuctionDollars(
  player: Pick<Player, "auction_value">,
): number | undefined {
  return coerceNumber(player.auction_value);
}

/**
 * Auction dollars for Research table display: omits catalog `value` fallback semantics
 * when `valuation_eligible === false` (e.g. `market_only` rows).
 */
export function leagueWideAuctionDollarsForDisplay(
  player: Pick<Player, "auction_value" | "valuation_eligible">,
): number | undefined {
  if (player.valuation_eligible === false) return undefined;
  return leagueWideAuctionDollars(player);
}

function coerceNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Finite number or numeric string (engine / JSON may stringify). */
function readFiniteScalar(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Prefer trimmed non-empty incoming string; otherwise keep fallback (catalog / prior merge). */
function mergeOptionalTrimmedString(
  incoming: string | undefined | null,
  fallback: string | undefined,
): string | undefined {
  if (typeof incoming === "string") {
    const t = incoming.trim();
    if (t !== "") return t;
  }
  return fallback;
}

/** Prefer primary when finite; used for optional numeric metadata from valuation rows. */
function preferFiniteNumber(
  primary: number | undefined,
  fallback: number | undefined,
): number | undefined {
  const p = coerceNumber(primary);
  if (p !== undefined) return p;
  return coerceNumber(fallback);
}

/**
 * Bid Edge dollars: prefer Engine `edge` when present;
 * else `team_value - recommended_bid`.
 */
export function playerValuationEdgeOrDiff(player: {
  edge?: number | null;
  recommended_bid?: number | null;
  team_value?: number | null;
}): number | undefined {
  const edge = readFiniteScalar(player.edge);
  if (edge !== undefined) return edge;
  const likelyBid = readFiniteScalar(player.recommended_bid);
  const yourValue = readFiniteScalar(player.team_value);
  if (likelyBid !== undefined && yourValue !== undefined) {
    return yourValue - likelyBid;
  }
  return undefined;
}

/** Team Value minus Auction Value. */
export function playerRosterEdgeDollars(
  player: Pick<Player, "team_value" | "auction_value">,
): number | undefined {
  const ta = readFiniteScalar(player.team_value);
  const auction = leagueWideAuctionDollars(player);
  if (ta === undefined || auction === undefined) return undefined;
  return ta - auction;
}

/** Bid Edge (same semantics as {@link playerValuationEdgeOrDiff}). */
export function playerBidEdgeDollars(
  player: Parameters<typeof playerValuationEdgeOrDiff>[0],
): ReturnType<typeof playerValuationEdgeOrDiff> {
  return playerValuationEdgeOrDiff(player);
}

/** Whole dollars; negative amounts render as `-$12`, never `$-12`. */
export function formatCurrencyWhole(value: number | null | undefined): string {
  const n = coerceNumber(value);
  if (n === undefined) return "—";
  const r = Math.round(n);
  const body = `$${Math.abs(r)}`;
  return r < 0 ? `-${body}` : body;
}

export function formatDeltaWhole(value: number | null | undefined): string {
  const n = coerceNumber(value);
  if (n === undefined) return "—";
  const r = Math.round(n);
  const sign = r > 0 ? "+" : "";
  return `${sign}${r}`;
}

export function formatMaybeDelta(value: number | null | undefined): string {
  return formatDeltaWhole(value);
}

/**
 * Signed whole-dollar deltas (e.g. Roster Edge): `+$4`, `-$2`, `$0`, `—`.
 * Minus precedes the dollar sign (`-$4`), matching {@link formatCurrencyWhole}.
 */
export function formatSignedDollarWhole(value: number | null | undefined): string {
  const n = coerceNumber(value);
  if (n === undefined) return "—";
  const r = Math.round(n);
  const body = `$${Math.abs(r)}`;
  if (r > 0) return `+${body}`;
  if (r < 0) return `-${body}`;
  return "$0";
}

export function formatMaybeDollar(
  value: number | null | undefined,
  options?: { oneDecimal?: boolean },
): string {
  const n = coerceNumber(value);
  if (n === undefined) return "—";
  if (!options?.oneDecimal) return formatCurrencyWhole(n);
  const rounded = Math.round(n * 10) / 10;
  const neg = rounded < 0;
  const abs = Math.abs(rounded);
  const body = Number.isInteger(abs)
    ? `$${abs}`
    : `$${abs.toFixed(1)}`;
  return neg ? `-${body}` : body;
}

function stripTrailingZerosFromDecimalString(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

/**
 * `valuation_explain.inflation_factor` — unitless multiplier (not dollars).
 */
export function formatInflationFactorMultiple(
  value: number | null | undefined,
): string {
  const n = coerceNumber(value);
  if (n === undefined) return "—";
  const s = stripTrailingZerosFromDecimalString(n.toFixed(2));
  return `${s}×`;
}

/**
 * `valuation_explain.pool_to_slot_ratio` — plain scalar (not dollars).
 */
export function formatPoolToSlotRatio(
  value: number | null | undefined,
): string {
  const n = coerceNumber(value);
  if (n === undefined) return "—";
  return stripTrailingZerosFromDecimalString(n.toFixed(2));
}

const EXPLAIN_MULT_NEUTRAL_EPS = 1e-6;

/** True when a unitless multiplier differs from 1 (hide neutral rows in explain UI). */
export function isMeaningfulExplainMultiplier(
  value: number | null | undefined,
): value is number {
  const n = coerceNumber(value);
  if (n === undefined) return false;
  return Math.abs(n - 1) > EXPLAIN_MULT_NEUTRAL_EPS;
}

/** Risk/role explain multipliers (e.g. `0.89×`, same rules as inflation_factor). */
export function formatExplainRiskMultiplier(
  value: number | null | undefined,
): string {
  return formatInflationFactorMultiple(value);
}

/**
 * `age_component` / `depth_component`: dollars when Engine sends additive $ deltas;
 * values strictly in (0, 1) are treated as unitless multipliers (`0.89×`).
 */
export function formatValuationExplainAgeDepthComponent(
  value: number | null | undefined,
): string | undefined {
  const n = coerceNumber(value);
  if (n === undefined) return undefined;
  if (Math.abs(n) < EXPLAIN_MULT_NEUTRAL_EPS) return undefined;
  if (n > 0 && n < 1) {
    return formatInflationFactorMultiple(n);
  }
  return formatMaybeDollar(n, {
    oneDecimal: Math.abs(n) < 20 && !Number.isInteger(n),
  });
}

function hasNonEmptyInjurySeverity(
  v: ValuationExplain["injury_severity"],
): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "number" && Number.isFinite(v)) return true;
  if (typeof v === "string") return v.trim() !== "";
  return false;
}

/** Any field rendered under “Risk / role adjustments.” in Player Detail. */
export function valuationExplainHasRiskRoleContent(
  ve: ValuationExplain | null | undefined,
): boolean {
  if (!ve) return false;
  if (typeof ve.age_years === "number" && Number.isFinite(ve.age_years) && ve.age_years > 0) {
    return true;
  }
  if (isMeaningfulExplainMultiplier(ve.age_multiplier)) return true;
  if (ve.depth_chart_position_resolved) return true;
  if (isMeaningfulExplainMultiplier(ve.depth_multiplier)) return true;
  if (isMeaningfulExplainMultiplier(ve.age_depth_combined_multiplier)) {
    return true;
  }
  if (hasNonEmptyInjurySeverity(ve.injury_severity)) return true;
  if (isMeaningfulExplainMultiplier(ve.injury_multiplier)) return true;
  if (formatValuationExplainAgeDepthComponent(ve.age_component) !== undefined) {
    return true;
  }
  if (formatValuationExplainAgeDepthComponent(ve.depth_component) !== undefined) {
    return true;
  }
  return false;
}

// Back-compat aliases during migration to semantic formatter names.
export const formatDollar = formatCurrencyWhole;
export const formatDollarDelta = formatDeltaWhole;

/** Align catalog `Player.id` with Engine `player_id` (string vs number JSON, whitespace). */
export function normalizeValuationPlayerId(id: string | number): string {
  return String(id).trim();
}

/** First finite dollar in order; used for Command Center money lines. */
function firstFiniteDollar(
  candidates: Array<number | undefined | null>,
): number | undefined {
  for (const x of candidates) {
    if (typeof x === "number" && Number.isFinite(x)) return x;
  }
  return undefined;
}

/**
 * Command Center header lines: one engine field each (no cross-field fallbacks).
 * Your → team_value; Likely bid anchor → recommended_bid; League-wide → auction_value.
 */
export function commandCenterValuationMoney(
  row: ValuationResult | undefined | null,
): { your: number | undefined; likely: number | undefined; market: number | undefined } {
  return {
    your: coerceNumber(row?.team_value),
    likely: coerceNumber(row?.recommended_bid),
    market: row ? leagueWideAuctionDollars(row) : undefined,
  };
}

/** Draftroom budget caps for the signed-in user's team (Command Center constraint layer). */
export type CommandCenterWalletCaps = {
  maxBid: number;
  budgetRemaining: number;
  openSpots: number;
};

/** Minimum dollars assumed reserved per *other* open roster slot when sizing the next legal bid. */
export const COMMAND_CENTER_MIN_RESERVE_PER_OPEN_SLOT = 1;

export function commandCenterWalletCapsFromMyTeam(
  league: Pick<League, "rosterSlots" | "budget"> | null | undefined,
  myTeamEntries: RosterEntry[],
): CommandCenterWalletCaps | null {
  if (!league?.rosterSlots) return null;
  const activeEntries = filterActiveAuctionEntries(myTeamEntries);
  const spent = activeEntries.reduce((s, e) => s + e.price, 0);
  const { open: openSpots } = teamRosterSlotCounts(
    rosterSlotsToRecord(league.rosterSlots),
    activeEntries,
  );
  const budgetRemaining = Math.max(0, (league.budget ?? 0) - spent);
  const maxBid =
    openSpots <= 0
      ? 0
      : Math.max(
          0,
          budgetRemaining -
            COMMAND_CENTER_MIN_RESERVE_PER_OPEN_SLOT *
              Math.max(0, openSpots - 1),
        );
  return { maxBid, budgetRemaining, openSpots };
}

/**
 * Max dollars legally executable on the next bid (Command Center constraint only).
 * min(max_bid, budget_remaining - min_reserve * max(open_spots - 1, 0))
 */
export function commandCenterMaxExecutableBid(caps: CommandCenterWalletCaps): number {
  const stretchCap = Math.max(
    0,
    caps.budgetRemaining -
      COMMAND_CENTER_MIN_RESERVE_PER_OPEN_SLOT *
        Math.max(0, caps.openSpots - 1),
  );
  return Math.min(caps.maxBid, stretchCap);
}

/** Sidebar bid-context row values (hide $0 when the roster cannot take another player). */
export function commandCenterBidContextMetrics(
  caps: CommandCenterWalletCaps | null,
  decision: Pick<CommandCenterBidDecision, "suggestedBid" | "notBidable">,
): {
  suggestedBid: number | undefined;
  maxBid: number | undefined;
  budgetLeft: number | undefined;
  dollarsPerSpot: number | undefined;
} {
  if (!caps) {
    return {
      suggestedBid: undefined,
      maxBid: undefined,
      budgetLeft: undefined,
      dollarsPerSpot: undefined,
    };
  }
  const budgetLeft = caps.budgetRemaining;
  if (caps.openSpots <= 0 || decision.notBidable) {
    return {
      suggestedBid: undefined,
      maxBid: undefined,
      budgetLeft,
      dollarsPerSpot: undefined,
    };
  }
  const maxBid = commandCenterMaxExecutableBid(caps);
  return {
    suggestedBid: decision.suggestedBid,
    maxBid: maxBid > 0 ? maxBid : undefined,
    budgetLeft,
    dollarsPerSpot: +(budgetLeft / caps.openSpots).toFixed(1),
  };
}

const COMMAND_CENTER_EDGE_AGGRESSIVE_USD = 3;
const COMMAND_CENTER_TOP_TIER_MAX = 2;

/** Round bid display to half-dollar steps; stays within [0, cap] when cap is passed. */
export function commandCenterRoundBidIncrement(
  n: number,
  maxExecutable?: number,
): number {
  let x = Math.max(0, Math.round(n * 2) / 2);
  if (typeof maxExecutable === "number" && Number.isFinite(maxExecutable)) {
    x = Math.min(x, maxExecutable);
  }
  return x;
}

export type CommandCenterBidDecision = {
  /** Engine team-specific value (no fallbacks). */
  yourValue: number | undefined;
  /** Primary actionable bid (capped + rounded). */
  suggestedBid: number;
  /** Raw cap before rounding (same units as engine dollars). */
  maxExecutableBid: number;
  /** Engine `edge` only (no client-side recompute); suppressed when {@link notBidable}. */
  edge: number | undefined;
  /** True when the executable cap binds below uncapped base (shows “budget-limited”). */
  budgetLimited: boolean;
  /** Uncapped base before min(max_executable): TA-leaning or recommended-leaning. */
  baseUncapped: number | undefined;
  /** Used TA-heavy base vs recommended-heavy base. */
  aggressive: boolean;
  likelyBid: number | undefined;
  marketValue: number | undefined;
  playerStrength: number | undefined;
  /** No dollars can legally be bid for the capped roster (do not show positive Bid Edge). */
  notBidable: boolean;
  /** Human-readable reason when {@link notBidable}. */
  notBidableReason: string | null;
};

/**
 * Decision-layer bid from engine fields + roster caps only (does not change engine numbers).
 */
export function commandCenterBidDecision(
  row: ValuationResult | undefined | null,
  playerValue: number | undefined,
  caps: CommandCenterWalletCaps | null,
): CommandCenterBidDecision {
  const rawTA = row?.team_value;
  const rawR = row?.recommended_bid;
  const rawA = row ? leagueWideAuctionDollars(row) : undefined;
  const rawB = row?.baseline_value;

  const yourValue = coerceNumber(rawTA);
  const likelyBid = coerceNumber(rawR);
  const marketValue = rawA;
  const playerStrength = firstFiniteDollar([rawB, rawA, rawR, rawTA, playerValue]);

  const edgeFromRow =
    typeof row?.edge === "number" && Number.isFinite(row.edge) ? row.edge : undefined;

  const auctionTier = row?.auction_tier ?? row?.tier;
  const aggressive =
    (typeof edgeFromRow === "number" &&
      edgeFromRow > COMMAND_CENTER_EDGE_AGGRESSIVE_USD) ||
    (typeof auctionTier === "number" &&
      auctionTier >= 1 &&
      auctionTier <= COMMAND_CENTER_TOP_TIER_MAX);

  const engineSuggested = firstFiniteDollar([rawR]);
  const teamMarginal = firstFiniteDollar([rawTA]);
  let baseUncapped =
    engineSuggested ?? firstFiniteDollar([rawTA, rawA, rawB, playerValue]);
  if (teamMarginal != null && baseUncapped != null) {
    baseUncapped = Math.min(baseUncapped, teamMarginal);
  }

  if (!caps) {
    const raw =
      baseUncapped ??
      yourValue ??
      firstFiniteDollar([playerValue]) ??
      0;
    const suggestedBid = commandCenterRoundBidIncrement(raw);
    return {
      yourValue,
      suggestedBid,
      maxExecutableBid: suggestedBid,
      edge: edgeFromRow,
      budgetLimited: false,
      baseUncapped,
      aggressive,
      likelyBid,
      marketValue,
      playerStrength,
      notBidable: false,
      notBidableReason: null,
    };
  }

  const maxExecutableBid = Math.max(0, commandCenterMaxExecutableBid(caps));
  const notBidable =
    maxExecutableBid <= 0 ||
    caps.openSpots <= 0 ||
    !Number.isFinite(maxExecutableBid);
  const notBidableReason = notBidable
    ? caps.openSpots <= 0
      ? "No open roster slots for selected team"
      : "No executable budget for selected team"
    : null;

  const baseNum = baseUncapped ?? 0;
  const rawSuggested = notBidable ? 0 : Math.min(baseNum, maxExecutableBid);
  const suggestedBid = notBidable
    ? 0
    : commandCenterRoundBidIncrement(rawSuggested, maxExecutableBid);

  const budgetLimited =
    !notBidable &&
    typeof baseUncapped === "number" &&
    Number.isFinite(baseUncapped) &&
    baseUncapped > maxExecutableBid + 1e-6;

  return {
    yourValue,
    suggestedBid,
    maxExecutableBid,
    edge: notBidable ? undefined : edgeFromRow,
    budgetLimited,
    baseUncapped,
    aggressive,
    likelyBid,
    marketValue,
    playerStrength,
    notBidable,
    notBidableReason,
  };
}

export type CommandCenterConstrainedMoney = {
  /** Intrinsic personalized value (unchanged engine semantics + fallbacks). */
  yourIntrinsic: number | undefined;
  /** Defaults log bid input — same as suggested bid (integer dollars). */
  youCanPay: number;
  /** League-wide auction dollars (`auction_value`), uncapped reference line. */
  market: number | undefined;
  /** min(recommended guidance, max executable); for log default / internal use. */
  likelyActionable: number | undefined;
  /** Executable cap binds below uncapped decision base. */
  budgetLimited: boolean;
};

/**
 * Applies roster budget caps on top of engine rows (Draftroom only; does not alter engine numbers).
 */
export function commandCenterConstrainedMoney(
  row: ValuationResult | undefined | null,
  playerValue: number | undefined,
  caps: CommandCenterWalletCaps | null,
): CommandCenterConstrainedMoney {
  const base = commandCenterValuationMoney(row);
  const d = commandCenterBidDecision(row, playerValue, caps);

  if (!caps) {
    const y = base.your ?? base.likely ?? playerValue ?? 0;
    return {
      yourIntrinsic: base.your,
      youCanPay: Math.max(0, Math.round(Number(y))),
      market: base.market,
      likelyActionable: base.likely,
      budgetLimited: false,
    };
  }

  const youCanPay = Math.max(0, Math.round(d.suggestedBid));

  const likelyBase = base.likely;
  const likelyActionable =
    likelyBase != null && Number.isFinite(likelyBase)
      ? Math.min(likelyBase, Math.round(d.maxExecutableBid))
      : undefined;

  return {
    yourIntrinsic: d.yourValue ?? base.your,
    youCanPay,
    market: d.marketValue ?? base.market,
    likelyActionable,
    budgetLimited: d.budgetLimited,
  };
}

export function resolveValuationNumber(
  player: Pick<
    Player,
    | "value"
    | "baseline_value"
    | "auction_value"
    | "recommended_bid"
    | "team_value"
    | "valuation_eligible"
  >,
  preferredField?: ValuationSortField,
): number {
  const ineligible = player.valuation_eligible === false;

  if (preferredField === "auction_value") {
    const v = leagueWideAuctionDollars(player);
    if (v !== undefined) return v;
    if (ineligible) return 0;
  } else if (preferredField) {
    const preferredValue = coerceNumber(player[preferredField]);
    if (preferredValue !== undefined) return preferredValue;
    if (ineligible) return 0;
  }
  for (const field of VALUATION_FALLBACK_ORDER) {
    if (field === "auction_value") {
      const v = leagueWideAuctionDollars(player);
      if (v !== undefined) return v;
      continue;
    }
    const candidate = coerceNumber(player[field]);
    if (candidate !== undefined) return candidate;
  }
  if (ineligible) return 0;
  return coerceNumber(player.value) ?? 0;
}

export function mergePlayerWithValuation(
  player: Player,
  valuation?: ValuationShape,
): Player {
  if (!valuation) return player;
  if (player.valuation_eligible === false) {
    const marketAdp = coerceNumber(valuation.market_adp);
    return {
      ...player,
      market_adp: marketAdp ?? player.market_adp,
      market_adp_source: mergeOptionalTrimmedString(
        valuation.market_adp_source,
        player.market_adp_source,
      ),
      market_adp_updated_at: mergeOptionalTrimmedString(
        valuation.market_adp_updated_at,
        player.market_adp_updated_at,
      ),
      market_adp_min: preferFiniteNumber(valuation.market_adp_min, player.market_adp_min),
      market_adp_max: preferFiniteNumber(valuation.market_adp_max, player.market_adp_max),
      market_pick_count: preferFiniteNumber(
        valuation.market_pick_count,
        player.market_pick_count,
      ),
    };
  }
  const auctionTierRaw =
    coerceNumber(valuation.auction_tier) ?? coerceNumber(valuation.tier);
  /** Ignore 0 — sparse Engine/board rows use it as a placeholder and must not wipe catalog tier. */
  const auctionTier =
    auctionTierRaw !== undefined &&
    Number.isFinite(auctionTierRaw) &&
    auctionTierRaw > 0
      ? auctionTierRaw
      : undefined;
  const auctionRank = coerceNumber(valuation.auction_rank);
  const baselineTier = coerceNumber(valuation.baseline_tier);
  const baselineRank = coerceNumber(valuation.baseline_rank);
  const marketAdp = coerceNumber(valuation.market_adp);
  return {
    ...player,
    auction_tier: auctionTier ?? player.auction_tier,
    auction_rank: auctionRank ?? player.auction_rank,
    baseline_tier: baselineTier ?? player.baseline_tier,
    baseline_rank: baselineRank ?? player.baseline_rank,
    market_adp: marketAdp ?? player.market_adp,
    market_adp_source: mergeOptionalTrimmedString(
      valuation.market_adp_source,
      player.market_adp_source,
    ),
    market_adp_updated_at: mergeOptionalTrimmedString(
      valuation.market_adp_updated_at,
      player.market_adp_updated_at,
    ),
    market_adp_min: preferFiniteNumber(
      valuation.market_adp_min,
      player.market_adp_min,
    ),
    market_adp_max: preferFiniteNumber(
      valuation.market_adp_max,
      player.market_adp_max,
    ),
    market_pick_count: preferFiniteNumber(
      valuation.market_pick_count,
      player.market_pick_count,
    ),
    baseline_value: coerceNumber(valuation.baseline_value) ?? player.baseline_value,
    auction_value: coerceNumber(valuation.auction_value) ?? player.auction_value,
    recommended_bid:
      coerceNumber(valuation.recommended_bid) ?? player.recommended_bid,
    max_bid: coerceNumber(valuation.max_bid) ?? player.max_bid,
    team_value: coerceNumber(valuation.team_value) ?? player.team_value,
    edge: coerceNumber(valuation.edge) ?? player.edge,
    inflation_model: valuation.inflation_model ?? player.inflation_model,
    indicator: valuation.indicator ?? player.indicator,
    explain_v2: valuation.explain_v2 ?? player.explain_v2,
    why: valuation.why ?? player.why,
    market_notes: valuation.market_notes ?? player.market_notes,
    valuation_explain: valuation.valuation_explain ?? player.valuation_explain,
    recommended_bid_note:
      valuation.recommended_bid_note ?? player.recommended_bid_note,
    edge_note: valuation.edge_note ?? player.edge_note,
  };
}

/** Modal display dollars that stay pinned to the board row when the board already sent finite values. */
const MODAL_PRESERVED_DOLLAR_FIELDS = [
  "auction_value",
  "recommended_bid",
  "team_value",
  "max_bid",
  "baseline_value",
  "edge",
] as const satisfies readonly (keyof ValuationShape)[];

function boardHasFiniteScalar(
  board: ValuationShape | undefined,
  field: (typeof MODAL_PRESERVED_DOLLAR_FIELDS)[number],
): boolean {
  if (!board) return false;
  return coerceNumber(board[field]) !== undefined;
}

/**
 * After `mergePlayerWithValuation(..., boardRow)`, merges focused `/valuation/player` fields
 * without overwriting board-backed dollar figures when the board row already had finite values.
 * Focused row fills missing core dollars and always contributes explain / notes when present.
 */
export function mergePlayerWithFocusedExplainEnrichment(
  playerAfterBoard: Player,
  boardValuation: ValuationShape | undefined,
  focused: ValuationShape | null,
): Player {
  if (!focused) return playerAfterBoard;

  let next: Player = { ...playerAfterBoard };

  for (const field of MODAL_PRESERVED_DOLLAR_FIELDS) {
    if (boardHasFiniteScalar(boardValuation, field)) {
      continue;
    }
    const fromFocused = coerceNumber(focused[field]);
    if (fromFocused !== undefined) {
      next = { ...next, [field]: fromFocused };
    }
  }

  const boardAuctionTier =
    coerceNumber(boardValuation?.auction_tier) ??
    coerceNumber(boardValuation?.tier);
  const focusedAuctionTier =
    coerceNumber(focused.auction_tier) ?? coerceNumber(focused.tier);

  return {
    ...next,
    auction_tier:
      boardAuctionTier !== undefined ? next.auction_tier : focusedAuctionTier ?? next.auction_tier,
    market_adp_source: mergeOptionalTrimmedString(
      focused.market_adp_source,
      next.market_adp_source,
    ),
    market_adp_updated_at: mergeOptionalTrimmedString(
      focused.market_adp_updated_at,
      next.market_adp_updated_at,
    ),
    market_adp_min: preferFiniteNumber(focused.market_adp_min, next.market_adp_min),
    market_adp_max: preferFiniteNumber(focused.market_adp_max, next.market_adp_max),
    market_pick_count: preferFiniteNumber(
      focused.market_pick_count,
      next.market_pick_count,
    ),
    inflation_model: focused.inflation_model ?? next.inflation_model,
    indicator: focused.indicator ?? next.indicator,
    explain_v2: focused.explain_v2 ?? next.explain_v2,
    why: focused.why ?? next.why,
    market_notes: focused.market_notes ?? next.market_notes,
    valuation_explain: focused.valuation_explain ?? next.valuation_explain,
    recommended_bid_note:
      focused.recommended_bid_note ?? next.recommended_bid_note,
    edge_note: focused.edge_note ?? next.edge_note,
  };
}

export function mergeCatalogPlayersWithValuations(
  players: Player[],
  valuationsByPlayerId: ReadonlyMap<string, ValuationShape>,
): Player[] {
  if (valuationsByPlayerId.size === 0) return players;
  return players.map((player) =>
    mergePlayerWithValuation(player, valuationsByPlayerId.get(player.id)),
  );
}

export function valuationSortLabel(field: ValuationSortField): string {
  if (field === "auction_value") return "League FMV";
  if (field === "team_value") return "Your team value";
  if (field === "recommended_bid") return "Suggested bid";
  return "Baseline Strength";
}

export function valuationTooltip(field: ValuationSortField): string {
  if (field === "auction_value") {
    return RESEARCH_TABLE_TOOLTIP_AUCTION_VALUE;
  }
  if (field === "team_value") {
    return RESEARCH_TABLE_TOOLTIP_TEAM_VALUE;
  }
  if (field === "recommended_bid") {
    return `${RECOMMENDED_BID_VS_AUCTION_VALUE_COPY} Shown here after wallet caps; can match your team value when the engine has little margin.`;
  }
  return BASELINE_STRENGTH_TOOLTIP;
}

export function defaultValuationSortForPage(
  page: "Research" | "MyDraft" | "AuctionCenter" | "CommandCenter",
): ValuationSortField {
  if (page === "CommandCenter") return "auction_value";
  return "auction_value";
}
