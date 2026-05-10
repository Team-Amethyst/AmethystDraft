import type {
  ValuationExplain,
  ValuationPlayerResponse,
  ValuationResponse,
  ValuationResult,
} from "./engine";

/** Accept finite numbers and numeric strings from JSON (engine occasionally stringifies). */
function readFiniteScalar(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function readFiniteFromRecord(
  row: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const k of keys) {
    const v = readFiniteScalar(row[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}

function readNonEmptyString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function readStringArrayField(
  row: Record<string, unknown>,
  snake: string,
  camel: string,
): string[] | undefined {
  const raw = row[snake] ?? row[camel];
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter(
    (x): x is string => typeof x === "string" && x.trim() !== "",
  );
  return out.length ? out : undefined;
}

function normalizeValuationExplain(raw: unknown): ValuationExplain | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const e = raw as Record<string, unknown>;
  const eff =
    e.effective_positions ??
    e.effectivePositions;
  const effective_positions = Array.isArray(eff)
    ? eff.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : undefined;
  const replacement_key_used = readNonEmptyString(
    e.replacement_key_used ?? e.replacementKeyUsed,
  );
  const replacement_value_used = readFiniteScalar(
    e.replacement_value_used ?? e.replacementValueUsed,
  );
  const surplus_basis = readNonEmptyString(e.surplus_basis ?? e.surplusBasis);
  const inflation_factor = readFiniteScalar(
    e.inflation_factor ?? e.inflationFactor,
  );
  const pool_to_slot_ratio = readFiniteScalar(
    e.pool_to_slot_ratio ?? e.poolToSlotRatio,
  );
  const scoring_category_warnings = readStringArrayField(
    e,
    "scoring_category_warnings",
    "scoringCategoryWarnings",
  );
  const age_years = readFiniteScalar(e.age_years ?? e.ageYears);
  const age_multiplier = readFiniteScalar(
    e.age_multiplier ?? e.ageMultiplier,
  );
  const depth_chart_position_resolved = readNonEmptyString(
    e.depth_chart_position_resolved ?? e.depthChartPositionResolved,
  );
  const depth_multiplier = readFiniteScalar(
    e.depth_multiplier ?? e.depthMultiplier,
  );
  const age_depth_combined_multiplier = readFiniteScalar(
    e.age_depth_combined_multiplier ?? e.ageDepthCombinedMultiplier,
  );
  const injurySevRaw = e.injury_severity ?? e.injurySeverity;
  const injury_severity =
    typeof injurySevRaw === "string"
      ? readNonEmptyString(injurySevRaw)
      : readFiniteScalar(injurySevRaw);
  const injury_multiplier = readFiniteScalar(
    e.injury_multiplier ?? e.injuryMultiplier,
  );
  const age_component = readFiniteScalar(e.age_component ?? e.ageComponent);
  const depth_component = readFiniteScalar(
    e.depth_component ?? e.depthComponent,
  );

  const out: ValuationExplain = {};
  if (effective_positions?.length) out.effective_positions = effective_positions;
  if (replacement_key_used !== undefined)
    out.replacement_key_used = replacement_key_used;
  if (replacement_value_used !== undefined)
    out.replacement_value_used = replacement_value_used;
  if (surplus_basis !== undefined) out.surplus_basis = surplus_basis;
  if (inflation_factor !== undefined) out.inflation_factor = inflation_factor;
  if (pool_to_slot_ratio !== undefined) out.pool_to_slot_ratio = pool_to_slot_ratio;
  if (scoring_category_warnings?.length)
    out.scoring_category_warnings = scoring_category_warnings;
  if (age_years !== undefined) out.age_years = age_years;
  if (age_multiplier !== undefined) out.age_multiplier = age_multiplier;
  if (depth_chart_position_resolved !== undefined) {
    out.depth_chart_position_resolved = depth_chart_position_resolved;
  }
  if (depth_multiplier !== undefined) out.depth_multiplier = depth_multiplier;
  if (age_depth_combined_multiplier !== undefined) {
    out.age_depth_combined_multiplier = age_depth_combined_multiplier;
  }
  if (injury_severity !== undefined) out.injury_severity = injury_severity;
  if (injury_multiplier !== undefined) out.injury_multiplier = injury_multiplier;
  if (age_component !== undefined) out.age_component = age_component;
  if (depth_component !== undefined) out.depth_component = depth_component;
  return Object.keys(out).length ? out : undefined;
}

function readValuationContextWarnings(
  o: Record<string, unknown>,
): string[] | undefined {
  const raw =
    o.valuation_context_warnings ?? o.valuationContextWarnings;
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter(
    (x): x is string => typeof x === "string" && x.trim() !== "",
  );
  return out.length ? out : undefined;
}

function readValuationContext(
  o: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const raw = o.valuation_context ?? o.valuationContext;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return { ...(raw as Record<string, unknown>) };
}

/** Same six money fields + `all_keys` for pipeline logs (A–F). */
export function valuationRowPipelineSnapshot(
  row: ValuationResult | null | undefined,
): {
  player_id: string | null;
  auction_value: number | null;
  recommended_bid: number | null;
  team_adjusted_value: number | null;
  edge: number | null;
  adjusted_value: number | null;
  baseline_value: number | null;
  all_keys: string[];
} | null {
  if (!row) return null;
  const av = row.auction_value;
  return {
    player_id: row.player_id ?? null,
    auction_value:
      av != null && Number.isFinite(av) ? av : null,
    recommended_bid:
      row.recommended_bid != null && Number.isFinite(row.recommended_bid)
        ? row.recommended_bid
        : null,
    team_adjusted_value:
      row.team_adjusted_value != null && Number.isFinite(row.team_adjusted_value)
        ? row.team_adjusted_value
        : null,
    edge: row.edge != null && Number.isFinite(row.edge) ? row.edge : null,
    adjusted_value: row.adjusted_value,
    baseline_value: row.baseline_value,
    all_keys: Object.keys(row).sort(),
  };
}

/** Snapshot a raw JSON valuation object (before `normalizeValuationResultRow`). */
export function rawValuationRowPipelineSnapshot(raw: unknown): {
  player_id: string | null;
  auction_value: number | null;
  recommended_bid: number | null;
  team_adjusted_value: number | null;
  edge: number | null;
  adjusted_value: number | null;
  baseline_value: number | null;
  all_keys: string[];
} | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const auc = readFiniteFromRecord(r, ["auction_value", "auctionValue"]);
  const rb = readFiniteFromRecord(r, ["recommended_bid", "recommendedBid"]);
  const ta = readFiniteFromRecord(r, ["team_adjusted_value", "teamAdjustedValue"]);
  const edge = readFiniteFromRecord(r, ["edge"]);
  const adj = readFiniteFromRecord(r, ["adjusted_value", "adjustedValue"]);
  const base = readFiniteFromRecord(r, ["baseline_value", "baselineValue"]);
  return {
    player_id: String(r.player_id ?? r.playerId ?? "").trim() || null,
    auction_value: auc ?? null,
    recommended_bid: rb ?? null,
    team_adjusted_value: ta ?? null,
    edge: edge ?? null,
    adjusted_value: adj ?? null,
    baseline_value: base ?? null,
    all_keys: Object.keys(r).sort(),
  };
}

/** Dev-only: literal fields vs camelCase aliases (does not invent values). */
export function valuationRowDebugLiterals(row: unknown): {
  literal_snake: Record<string, unknown>;
  literal_camel: Record<string, unknown>;
  all_keys: string[];
} | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  return {
    literal_snake: {
      player_id: r.player_id,
      auction_value: r.auction_value,
      recommended_bid: r.recommended_bid,
      team_adjusted_value: r.team_adjusted_value,
      edge: r.edge,
      adjusted_value: r.adjusted_value,
      baseline_value: r.baseline_value,
    },
    literal_camel: {
      playerId: r.playerId,
      auctionValue: r.auctionValue,
      recommendedBid: r.recommendedBid,
      teamAdjustedValue: r.teamAdjustedValue,
      edge: r.edge,
      adjustedValue: r.adjustedValue,
      baselineValue: r.baselineValue,
    },
    all_keys: Object.keys(r).sort(),
  };
}

/**
 * Map Engine JSON (snake_case and/or camelCase) into our `ValuationResult` shape.
 * Does not copy unrelated keys onto the result.
 */
export function normalizeValuationResultRow(
  row: Record<string, unknown>,
): ValuationResult {
  const player_id = String(
    row.player_id ?? row.playerId ?? "",
  ).trim();
  const name = String(row.name ?? "");
  const position = String(row.position ?? "");
  const tierLegacy = readFiniteFromRecord(row, ["tier"]);
  const auction_tierExplicit = readFiniteFromRecord(row, [
    "auction_tier",
    "auctionTier",
  ]);
  const auction_tier =
    auction_tierExplicit ?? tierLegacy ?? 0;
  const baseline_tier = readFiniteFromRecord(row, [
    "baseline_tier",
    "baselineTier",
  ]);
  const auction_rank =
    readFiniteFromRecord(row, ["auction_rank", "auctionRank"]) ??
    readFiniteFromRecord(row, ["adp"]);
  const baseline_rank = readFiniteFromRecord(row, [
    "baseline_rank",
    "baselineRank",
  ]);
  const market_adp = readFiniteFromRecord(row, ["market_adp", "marketAdp"]);
  const market_adp_source = readNonEmptyString(
    row.market_adp_source ?? row.marketAdpSource,
  );
  const market_adp_updated_at = readNonEmptyString(
    row.market_adp_updated_at ?? row.marketAdpUpdatedAt,
  );
  const market_adp_min = readFiniteFromRecord(row, [
    "market_adp_min",
    "marketAdpMin",
  ]);
  const market_adp_max = readFiniteFromRecord(row, [
    "market_adp_max",
    "marketAdpMax",
  ]);
  const market_pick_count = readFiniteFromRecord(row, [
    "market_pick_count",
    "marketPickCount",
  ]);
  const baseline_value =
    readFiniteFromRecord(row, ["baseline_value", "baselineValue"]) ?? 0;
  const auctionVal = readFiniteFromRecord(row, ["auction_value", "auctionValue"]);
  const adjVal = readFiniteFromRecord(row, ["adjusted_value", "adjustedValue"]);
  const adjusted_value = adjVal ?? auctionVal ?? 0;
  const recommended_bid = readFiniteFromRecord(row, [
    "recommended_bid",
    "recommendedBid",
  ]);
  const team_adjusted_value = readFiniteFromRecord(row, [
    "team_adjusted_value",
    "teamAdjustedValue",
  ]);
  const edge = readFiniteFromRecord(row, ["edge"]);

  const indicatorRaw = row.indicator;
  const indicator: ValuationResult["indicator"] =
    indicatorRaw === "Steal" || indicatorRaw === "Reach" || indicatorRaw === "Fair Value"
      ? indicatorRaw
      : "Fair Value";

  const out: ValuationResult = {
    player_id,
    name,
    position,
    tier: auction_tier,
    baseline_value,
    adjusted_value,
    indicator,
  };
  out.auction_tier = auction_tier;
  if (baseline_tier !== undefined) out.baseline_tier = baseline_tier;
  if (auction_rank !== undefined) out.auction_rank = auction_rank;
  if (baseline_rank !== undefined) out.baseline_rank = baseline_rank;
  if (market_adp !== undefined) out.market_adp = market_adp;
  if (market_adp_source !== undefined) out.market_adp_source = market_adp_source;
  if (market_adp_updated_at !== undefined)
    out.market_adp_updated_at = market_adp_updated_at;
  if (market_adp_min !== undefined) out.market_adp_min = market_adp_min;
  if (market_adp_max !== undefined) out.market_adp_max = market_adp_max;
  if (market_pick_count !== undefined) out.market_pick_count = market_pick_count;
  if (auctionVal !== undefined) out.auction_value = auctionVal;
  else if (adjVal !== undefined) out.auction_value = adjVal;
  if (recommended_bid !== undefined) out.recommended_bid = recommended_bid;
  if (team_adjusted_value !== undefined) out.team_adjusted_value = team_adjusted_value;
  if (edge !== undefined) out.edge = edge;

  if (auction_rank !== undefined) out.adp = auction_rank;

  const inflation_model = row.inflation_model;
  if (inflation_model === "replacement_slots_v2") {
    out.inflation_model = inflation_model;
  }

  if (row.explain_v2 && typeof row.explain_v2 === "object") {
    out.explain_v2 = row.explain_v2 as ValuationResult["explain_v2"];
  }
  if (Array.isArray(row.why)) out.why = row.why as string[];
  if (typeof row.team === "string") out.team = row.team;

  const ve = normalizeValuationExplain(
    row.valuation_explain ?? row.valuationExplain,
  );
  if (ve) out.valuation_explain = ve;

  const rbn = readNonEmptyString(
    row.recommended_bid_note ?? row.recommendedBidNote,
  );
  if (rbn !== undefined) out.recommended_bid_note = rbn;

  const en = readNonEmptyString(row.edge_note ?? row.edgeNote);
  if (en !== undefined) out.edge_note = en;

  return out;
}

function firstFinite(
  a: number | undefined,
  b: number | undefined,
): number | undefined {
  if (typeof a === "number" && Number.isFinite(a)) return a;
  if (typeof b === "number" && Number.isFinite(b)) return b;
  return undefined;
}

/**
 * When applying a bulk board refresh, keep per-player optional fields from `previous`
 * if the board row omits them (board payload is often slimmer than `/valuation/player`).
 * `incoming` wins for a field when it provides a finite number (including over previous).
 */
export function mergeValuationBoardRowIntoPrevious(
  previous: ValuationResult | undefined,
  incoming: ValuationResult,
): ValuationResult {
  if (!previous) return incoming;
  const merged: ValuationResult = { ...previous, ...incoming };
  merged.recommended_bid = firstFinite(
    incoming.recommended_bid,
    previous.recommended_bid,
  );
  merged.team_adjusted_value = firstFinite(
    incoming.team_adjusted_value,
    previous.team_adjusted_value,
  );
  merged.edge = firstFinite(incoming.edge, previous.edge);
  merged.baseline_value =
    firstFinite(incoming.baseline_value, previous.baseline_value) ??
    previous.baseline_value;
  merged.adjusted_value =
    firstFinite(incoming.adjusted_value, previous.adjusted_value) ??
    previous.adjusted_value;
  merged.auction_value = firstFinite(incoming.auction_value, previous.auction_value);
  merged.auction_rank = firstFinite(incoming.auction_rank, previous.auction_rank);
  merged.auction_tier = firstFinite(incoming.auction_tier, previous.auction_tier);
  merged.baseline_rank = firstFinite(incoming.baseline_rank, previous.baseline_rank);
  merged.baseline_tier = firstFinite(incoming.baseline_tier, previous.baseline_tier);
  merged.market_adp = firstFinite(incoming.market_adp, previous.market_adp);
  merged.adp = firstFinite(incoming.adp, previous.adp);
  merged.market_adp_source =
    incoming.market_adp_source ?? previous.market_adp_source;
  merged.market_adp_updated_at =
    incoming.market_adp_updated_at ?? previous.market_adp_updated_at;
  merged.market_adp_min = firstFinite(
    incoming.market_adp_min,
    previous.market_adp_min,
  );
  merged.market_adp_max = firstFinite(
    incoming.market_adp_max,
    previous.market_adp_max,
  );
  merged.market_pick_count = firstFinite(
    incoming.market_pick_count,
    previous.market_pick_count,
  );

  merged.recommended_bid_note =
    incoming.recommended_bid_note ?? previous.recommended_bid_note;
  merged.edge_note = incoming.edge_note ?? previous.edge_note;
  merged.valuation_explain =
    incoming.valuation_explain ?? previous.valuation_explain;

  return merged;
}

function normalizeValuationsArray(raw: unknown): ValuationResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) =>
    x && typeof x === "object"
      ? normalizeValuationResultRow(x as Record<string, unknown>)
      : normalizeValuationResultRow({}),
  );
}

export function normalizeValuationResponseBody(raw: unknown): ValuationResponse {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid valuation response: expected object");
  }
  const o = raw as Record<string, unknown>;
  const base = { ...raw } as ValuationResponse;
  base.valuations = normalizeValuationsArray(o.valuations);
  const ut =
    typeof o.user_team_id_used === "string"
      ? o.user_team_id_used
      : typeof o.userTeamIdUsed === "string"
        ? o.userTeamIdUsed
        : undefined;
  if (ut) base.user_team_id_used = ut;

  const warnings = readValuationContextWarnings(o);
  if (warnings) base.valuation_context_warnings = warnings;

  const ctx = readValuationContext(o);
  if (ctx) base.valuation_context = ctx;

  return base;
}

export function normalizeValuationPlayerResponseBody(
  raw: unknown,
): ValuationPlayerResponse {
  const base = normalizeValuationResponseBody(raw) as ValuationPlayerResponse;
  const o = raw as Record<string, unknown>;
  const p = o.player;
  if (p && typeof p === "object") {
    base.player = normalizeValuationResultRow(p as Record<string, unknown>);
  }
  const requestPid = String(o.player_id ?? "").trim();
  if (!base.player && requestPid) {
    base.player = base.valuations.find(
      (v) => String(v.player_id).trim() === requestPid,
    );
  }
  /** Prefer focused `player` row; merge matching `valuations[]` entry (player wins finite fields). */
  const pidFocus = String(base.player?.player_id ?? requestPid ?? "").trim();
  if (pidFocus) {
    const fromList = base.valuations.find(
      (v) => String(v.player_id).trim() === pidFocus,
    );
    if (fromList && base.player) {
      base.player = mergeValuationBoardRowIntoPrevious(fromList, base.player);
    } else if (fromList && !base.player) {
      base.player = fromList;
    }
  }
  return base;
}

/** Locate the raw JSON valuation object for a player (snake or camel `player_id`). */
export function findRawValuationEntry(
  raw: unknown,
  normalizedPlayerId: string,
): unknown {
  const pid = normalizedPlayerId.trim();
  if (!pid || !raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (o.player && typeof o.player === "object") {
    const pr = o.player as Record<string, unknown>;
    if (String(pr.player_id ?? pr.playerId ?? "").trim() === pid) return o.player;
  }
  const vals = o.valuations;
  if (!Array.isArray(vals)) return undefined;
  for (const x of vals) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    if (String(r.player_id ?? r.playerId ?? "").trim() === pid) return x;
  }
  return undefined;
}
