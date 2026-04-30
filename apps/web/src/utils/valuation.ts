import type { Player } from "../types/player";
import type { ValuationResult } from "../api/engine";
import type { League } from "../contexts/LeagueContext";
import type { RosterEntry } from "../api/roster";

export type ValuationSortField =
  | "team_adjusted_value"
  | "recommended_bid"
  | "adjusted_value"
  | "baseline_value";

export interface ValuationShape {
  player_id: string;
  baseline_value?: number;
  adjusted_value?: number;
  recommended_bid?: number;
  team_adjusted_value?: number;
  edge?: number;
  inflation_model?: "replacement_slots_v2";
  indicator?: "Steal" | "Reach" | "Fair Value";
  explain_v2?: Player["explain_v2"];
  why?: string[];
  market_notes?: string[];
}

export const VALUATION_FALLBACK_ORDER: ValuationSortField[] = [
  "team_adjusted_value",
  "recommended_bid",
  "adjusted_value",
  "baseline_value",
];

function coerceNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Val Diff for tables: prefer engine `edge` when present; otherwise TA minus likely bid.
 * Matches prior PlayerTable behavior in one place for reuse.
 */
export function playerValuationEdgeOrDiff(player: {
  edge?: number | null;
  recommended_bid?: number | null;
  team_adjusted_value?: number | null;
}): number | undefined {
  const edge = coerceNumber(player.edge);
  if (edge !== undefined) return edge;
  const likelyBid = coerceNumber(player.recommended_bid);
  const yourValue = coerceNumber(player.team_adjusted_value);
  if (likelyBid !== undefined && yourValue !== undefined) {
    return yourValue - likelyBid;
  }
  return undefined;
}

export function formatCurrencyWhole(value: number | null | undefined): string {
  const n = coerceNumber(value);
  if (n === undefined) return "—";
  return `$${Math.round(n)}`;
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

export function formatMaybeDollar(
  value: number | null | undefined,
  options?: { oneDecimal?: boolean },
): string {
  const n = coerceNumber(value);
  if (n === undefined) return "—";
  if (!options?.oneDecimal) return formatCurrencyWhole(n);
  const rounded = Math.round(n * 10) / 10;
  if (Number.isInteger(rounded)) return `$${rounded}`;
  return `$${rounded.toFixed(1)}`;
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
 * Your Value → team_adjusted_value; Likely / Market clearing → recommended_bid.
 */
export function commandCenterValuationMoney(
  row: ValuationResult | undefined | null,
  _playerValue: number | undefined,
): { your: number | undefined; likely: number | undefined; market: number | undefined } {
  return {
    your: coerceNumber(row?.team_adjusted_value),
    likely: coerceNumber(row?.recommended_bid),
    market: coerceNumber(row?.recommended_bid),
  };
}

/** Draftroom budget caps for the signed-in user's team (Command Center constraint layer). */
export type CommandCenterWalletCaps = {
  maxBid: number;
  budgetRemaining: number;
  openSpots: number;
};

export function commandCenterWalletCapsFromMyTeam(
  league: Pick<League, "rosterSlots" | "budget"> | null | undefined,
  myTeamEntries: RosterEntry[],
): CommandCenterWalletCaps | null {
  if (!league?.rosterSlots) return null;
  const totalSlots = Object.values(league.rosterSlots).reduce((a, b) => a + b, 0);
  const filled = myTeamEntries.length;
  const spent = myTeamEntries.reduce((s, e) => s + e.price, 0);
  const openSpots = Math.max(0, totalSlots - filled);
  const budgetRemaining = Math.max(0, (league.budget ?? 0) - spent);
  const maxBid =
    openSpots > 0 ? Math.max(1, budgetRemaining - (openSpots - 1)) : 0;
  return { maxBid, budgetRemaining, openSpots };
}

/**
 * Max dollars legally executable on the next bid (Command Center constraint only).
 * min(max_bid, budget_remaining - (open_spots - 1))
 */
export function commandCenterMaxExecutableBid(caps: CommandCenterWalletCaps): number {
  const stretchCap = Math.max(
    0,
    caps.budgetRemaining - Math.max(0, caps.openSpots - 1),
  );
  return Math.min(caps.maxBid, stretchCap);
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
  /** Engine `team_adjusted_value` only (no fallbacks). */
  yourValue: number | undefined;
  /** Primary actionable bid (capped + rounded). */
  suggestedBid: number;
  /** Raw cap before rounding (same units as engine dollars). */
  maxExecutableBid: number;
  /** Engine `edge` only (no client-side recompute). */
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
};

/**
 * Decision-layer bid from engine fields + roster caps only (does not change engine numbers).
 */
export function commandCenterBidDecision(
  row: ValuationResult | undefined | null,
  playerValue: number | undefined,
  caps: CommandCenterWalletCaps | null,
): CommandCenterBidDecision {
  const rawTA = row?.team_adjusted_value;
  const rawR = row?.recommended_bid;
  const rawA = row?.adjusted_value;
  const rawB = row?.baseline_value;

  const yourValue = coerceNumber(rawTA);
  const likelyBid = coerceNumber(rawR);
  const marketValue = coerceNumber(rawR);
  const playerStrength = firstFiniteDollar([rawB, rawA, rawR, rawTA, playerValue]);

  const edgeFromRow =
    typeof row?.edge === "number" && Number.isFinite(row.edge) ? row.edge : undefined;

  const tier = row?.tier;
  const aggressive =
    (typeof edgeFromRow === "number" &&
      edgeFromRow > COMMAND_CENTER_EDGE_AGGRESSIVE_USD) ||
    (typeof tier === "number" &&
      tier >= 1 &&
      tier <= COMMAND_CENTER_TOP_TIER_MAX);

  const baseAgg = firstFiniteDollar([rawTA, rawR, rawA, rawB, playerValue]);
  const baseCon = firstFiniteDollar([rawR, rawTA, rawA, rawB, playerValue]);
  const baseUncapped = aggressive ? baseAgg : baseCon;

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
    };
  }

  const maxExecutableBid = Math.max(0, commandCenterMaxExecutableBid(caps));
  const baseNum = baseUncapped ?? 0;
  const rawSuggested = Math.min(baseNum, maxExecutableBid);
  const suggestedBid = commandCenterRoundBidIncrement(
    rawSuggested,
    maxExecutableBid,
  );

  const budgetLimited =
    typeof baseUncapped === "number" &&
    Number.isFinite(baseUncapped) &&
    baseUncapped > maxExecutableBid + 1e-6;

  return {
    yourValue,
    suggestedBid,
    maxExecutableBid,
    edge: edgeFromRow,
    budgetLimited,
    baseUncapped,
    aggressive,
    likelyBid,
    marketValue,
    playerStrength,
  };
}

export type CommandCenterConstrainedMoney = {
  /** Intrinsic personalized value (unchanged engine semantics + fallbacks). */
  yourIntrinsic: number | undefined;
  /** Defaults log bid input — same as suggested bid (integer dollars). */
  youCanPay: number;
  /** Model / list value (uncapped reference). */
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
  const base = commandCenterValuationMoney(row, playerValue);
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
    | "adjusted_value"
    | "recommended_bid"
    | "team_adjusted_value"
  >,
  preferredField?: ValuationSortField,
): number {
  if (preferredField) {
    const preferredValue = coerceNumber(player[preferredField]);
    if (preferredValue !== undefined) return preferredValue;
  }
  for (const field of VALUATION_FALLBACK_ORDER) {
    const candidate = coerceNumber(player[field]);
    if (candidate !== undefined) return candidate;
  }
  return coerceNumber(player.value) ?? 0;
}

export function mergePlayerWithValuation(
  player: Player,
  valuation?: ValuationShape,
): Player {
  if (!valuation) return player;
  return {
    ...player,
    baseline_value: coerceNumber(valuation.baseline_value) ?? player.baseline_value,
    adjusted_value: coerceNumber(valuation.adjusted_value) ?? player.adjusted_value,
    recommended_bid:
      coerceNumber(valuation.recommended_bid) ?? player.recommended_bid,
    team_adjusted_value:
      coerceNumber(valuation.team_adjusted_value) ?? player.team_adjusted_value,
    edge: coerceNumber(valuation.edge) ?? player.edge,
    inflation_model: valuation.inflation_model ?? player.inflation_model,
    indicator: valuation.indicator ?? player.indicator,
    explain_v2: valuation.explain_v2 ?? player.explain_v2,
    why: valuation.why ?? player.why,
    market_notes: valuation.market_notes ?? player.market_notes,
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
  if (field === "team_adjusted_value") return "Your Value";
  if (field === "recommended_bid") return "Likely Bid";
  if (field === "adjusted_value") return "Market Value";
  return "Player Strength";
}

export function valuationTooltip(field: ValuationSortField): string {
  if (field === "team_adjusted_value") {
    return "Personalized value based on your roster needs and budget.";
  }
  if (field === "recommended_bid") {
    return "General auction guidance based on player strength and market conditions.";
  }
  if (field === "adjusted_value") {
    return "Model value based on remaining roster slots, replacement levels, and league budget.";
  }
  return "League-adjusted player value before auction context.";
}

export function defaultValuationSortForPage(
  page: "Research" | "MyDraft" | "AuctionCenter" | "CommandCenter",
): ValuationSortField {
  if (page === "Research") return "recommended_bid";
  if (page === "CommandCenter") return "adjusted_value";
  return "team_adjusted_value";
}
