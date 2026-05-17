/**
 * Engine → Draft (BFF) valuation response boundary.
 * Transforms raw Engine JSON into the intentional product contract.
 */

export type ShapeValuationForDraftOptions = {
  /** When true, attach full engine JSON under `diagnostics.engine_response`. */
  debug: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readFinite(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function copyDisplayFields(
  src: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const str = (k: string) =>
    typeof src[k] === "string" ? src[k] : undefined;
  const id = String(src.player_id ?? src.playerId ?? "").trim();
  if (id) out.player_id = id;
  if (typeof src.name === "string") out.name = src.name;
  if (typeof src.position === "string") out.position = src.position;
  const team = str("team");
  if (team !== undefined) out.team = team;

  const catalog_rank = readFinite(src.catalog_rank ?? src.catalogRank);
  const catalog_tier = readFinite(src.catalog_tier ?? src.catalogTier);
  if (catalog_rank !== undefined) out.catalog_rank = catalog_rank;
  if (catalog_tier !== undefined) out.catalog_tier = catalog_tier;

  const baseline_rank = readFinite(src.baseline_rank ?? src.baselineRank);
  const auction_rank = readFinite(src.auction_rank ?? src.auctionRank);
  const baseline_tier = readFinite(src.baseline_tier ?? src.baselineTier);
  const auction_tier = readFinite(src.auction_tier ?? src.auctionTier);
  const tierLegacy = readFinite(src.tier);
  if (baseline_rank !== undefined) out.baseline_rank = baseline_rank;
  if (auction_rank !== undefined) out.auction_rank = auction_rank;
  if (baseline_tier !== undefined) out.baseline_tier = baseline_tier;
  if (auction_tier !== undefined) out.auction_tier = auction_tier;
  else if (tierLegacy !== undefined) out.auction_tier = tierLegacy;
  if (tierLegacy !== undefined) out.tier = tierLegacy;

  const market_adp = readFinite(src.market_adp ?? src.marketAdp);
  if (market_adp !== undefined) out.market_adp = market_adp;
  const mas = str("market_adp_source") ?? str("marketAdpSource");
  if (mas !== undefined) out.market_adp_source = mas;
  const mau = str("market_adp_updated_at") ?? str("marketAdpUpdatedAt");
  if (mau !== undefined) out.market_adp_updated_at = mau;
  const mamn = readFinite(src.market_adp_min ?? src.marketAdpMin);
  const mamx = readFinite(src.market_adp_max ?? src.marketAdpMax);
  const mpc = readFinite(src.market_pick_count ?? src.marketPickCount);
  if (mamn !== undefined) out.market_adp_min = mamn;
  if (mamx !== undefined) out.market_adp_max = mamx;
  if (mpc !== undefined) out.market_pick_count = mpc;

  return out;
}

function stripValuationExplainProduct(
  ve: Record<string, unknown>,
  opts: { stripScoringWarnings: boolean },
): Record<string, unknown> {
  const next = { ...ve };
  delete next.durability_expectation;
  delete next.durability_expectation_reasons;
  delete next.two_way_role_selected;
  delete next.hitter_baseline_candidate;
  delete next.pitcher_baseline_candidate;
  if (opts.stripScoringWarnings) {
    delete next.scoring_category_warnings;
    delete next.scoringCategoryWarnings;
  }
  return next;
}

function shapeRowForDraft(
  row: Record<string, unknown>,
  opts: { stripExplainScoringWarnings: boolean },
): Record<string, unknown> {
  const out = copyDisplayFields(row);

  const baseline_value = readFinite(row.baseline_value ?? row.baselineValue) ?? 0;
  out.baseline_value = baseline_value;

  const auction_value =
    readFinite(row.auction_value ?? row.auctionValue) ??
    readFinite(row.adjusted_value ?? row.adjustedValue);
  if (auction_value !== undefined) out.auction_value = auction_value;

  /** Product `team_value`: Engine `team_adjusted_value`, else league FMV (same minuend as Engine edge). */
  const team_adjusted_direct = readFinite(
    row.team_adjusted_value ?? row.teamAdjustedValue,
  );
  const team_value =
    team_adjusted_direct !== undefined
      ? team_adjusted_direct
      : auction_value;
  if (team_value !== undefined) out.team_value = team_value;

  let recommended_bid = readFinite(
    row.recommended_bid ?? row.recommendedBid,
  );
  const max_bid = readFinite(row.max_bid ?? row.maxBid);
  if (
    recommended_bid !== undefined &&
    max_bid !== undefined &&
    recommended_bid > max_bid
  ) {
    recommended_bid = max_bid;
  }
  if (recommended_bid !== undefined) out.recommended_bid = recommended_bid;
  if (max_bid !== undefined) out.max_bid = max_bid;

  const rb = recommended_bid;
  const tv = team_value;
  if (rb !== undefined && tv !== undefined) {
    out.edge = parseFloat((tv - rb).toFixed(2));
  } else {
    const e = readFinite(row.edge);
    if (e !== undefined) out.edge = e;
  }

  const ind = row.indicator;
  if (ind === "Steal" || ind === "Reach" || ind === "Fair Value") {
    out.indicator = ind;
  } else {
    out.indicator = "Fair Value";
  }

  if (row.inflation_model === "replacement_slots_v2") {
    out.inflation_model = "replacement_slots_v2";
  }

  const inf = readFinite(row.inflation_factor ?? row.inflationFactor);
  if (inf !== undefined) out.inflation_factor = inf;

  const sc = readFinite(row.scarcity_adjustment ?? row.scarcityAdjustment);
  const ia = readFinite(row.inflation_adjustment ?? row.inflationAdjustment);
  if (sc !== undefined) out.scarcity_adjustment = sc;
  if (ia !== undefined) out.inflation_adjustment = ia;

  if (Array.isArray(row.why))
    out.why = row.why.filter((x): x is string => typeof x === "string");

  if (row.explain_v2 && isRecord(row.explain_v2)) {
    out.explain_v2 = row.explain_v2;
  }

  const veRaw = row.valuation_explain ?? row.valuationExplain;
  if (veRaw && isRecord(veRaw)) {
    out.valuation_explain = stripValuationExplainProduct(veRaw, {
      stripScoringWarnings: opts.stripExplainScoringWarnings,
    });
  }

  const rbn =
    typeof row.recommended_bid_note === "string"
      ? row.recommended_bid_note
      : typeof row.recommendedBidNote === "string"
        ? row.recommendedBidNote
        : undefined;
  const en =
    typeof row.edge_note === "string"
      ? row.edge_note
      : typeof row.edgeNote === "string"
        ? row.edgeNote
        : undefined;
  if (rbn?.trim()) out.recommended_bid_note = rbn.trim();
  if (en?.trim()) out.edge_note = en.trim();

  const ar = readFinite(row.auction_rank ?? row.auctionRank);
  if (ar !== undefined) out.adp = ar;

  return out;
}

function collectScoringCategoryWarnings(
  envelope: Record<string, unknown>,
  rows: Record<string, unknown>[],
): string[] {
  const seen = new Set<string>();
  const add = (t: string) => {
    const s = t.trim();
    if (s) seen.add(s);
  };
  const top = envelope.scoring_category_warnings;
  if (Array.isArray(top)) {
    for (const x of top) if (typeof x === "string") add(x);
  }
  for (const row of rows) {
    const ve = row.valuation_explain ?? row.valuationExplain;
    if (!isRecord(ve)) continue;
    const sw =
      ve.scoring_category_warnings ?? ve.scoringCategoryWarnings;
    if (!Array.isArray(sw)) continue;
    for (const x of sw) if (typeof x === "string") add(x);
  }
  return [...seen];
}

function shapeContextV2ForDraft(
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const msSrc = raw.market_summary ?? raw.marketSummary;
  const msIn = isRecord(msSrc) ? msSrc : null;

  const market_summary: Record<string, unknown> = {};
  if (msIn) {
    if (typeof msIn.headline === "string") market_summary.headline = msIn.headline;
    const iff = readFinite(msIn.inflation_factor);
    if (iff !== undefined) market_summary.inflation_factor = iff;
    const pcn = readFinite(msIn.inflation_percent_vs_neutral);
    if (pcn !== undefined) {
      market_summary.inflation_percent_vs_neutral = pcn;
    }
    const pao = readFinite(msIn.inflation_percent_vs_auction_open);
    if (pao !== undefined) {
      market_summary.inflation_percent_vs_auction_open = pao;
    }
    const idx = readFinite(msIn.inflation_index_vs_opening_auction);
    if (idx !== undefined) {
      market_summary.inflation_index_vs_opening_auction = idx;
    }
  }

  const posAlerts = raw.position_alerts ?? raw.positionAlerts;
  const position_alerts = Array.isArray(posAlerts)
    ? posAlerts.filter((x) => isRecord(x))
    : [];

  const mpSrc = raw.market_pressure ?? raw.marketPressure;
  const market_pressure =
    isRecord(mpSrc) ? JSON.parse(JSON.stringify(mpSrc)) : undefined;

  if (
    !Object.keys(market_summary).length &&
    !position_alerts.length &&
    !market_pressure
  ) {
    return undefined;
  }

  const boxed: Record<string, unknown> = { position_alerts };
  if (Object.keys(market_summary).length) {
    boxed.market_summary = market_summary;
  }
  if (market_pressure) {
    boxed.market_pressure = market_pressure;
  }
  return boxed;
}

/**
 * Single boundary: raw Engine valuation JSON → Draft product contract.
 */
export function shapeValuationResponseForDraft(
  engineResponse: unknown,
  options: ShapeValuationForDraftOptions,
): Record<string, unknown> {
  if (!isRecord(engineResponse)) {
    return { valuations: [], calculated_at: new Date().toISOString() };
  }
  const src = engineResponse;

  const valuationsIn = src.valuations;
  const rawRows: Record<string, unknown>[] = Array.isArray(valuationsIn)
    ? valuationsIn.filter(isRecord)
    : [];

  const mergedScoring = collectScoringCategoryWarnings(src, rawRows);
  const stripExplainWarnings = mergedScoring.length > 0;

  const valuations = rawRows.map((row) =>
    shapeRowForDraft(row, {
      stripExplainScoringWarnings: stripExplainWarnings,
    }),
  );

  const calculated_at =
    typeof src.calculated_at === "string"
      ? src.calculated_at
      : typeof src.calculatedAt === "string"
        ? src.calculatedAt
        : new Date().toISOString();

  const inflation_factor = readFinite(src.inflation_factor ?? src.inflationFactor);
  const inflation_model = src.inflation_model ?? src.inflationModel;
  const inflation_index_vs_opening_auction = readFinite(
    src.inflation_index_vs_opening_auction ??
      src.inflationIndexVsOpeningAuction,
  );

  const total_budget_remaining = readFinite(
    src.total_budget_remaining ?? src.totalBudgetRemaining,
  );
  const players_remaining = readFinite(
    src.players_remaining ?? src.playersRemaining,
  );

  const out: Record<string, unknown> = {
    calculated_at,
    valuations,
  };

  if (inflation_factor !== undefined) out.inflation_factor = inflation_factor;
  if (inflation_model === "replacement_slots_v2") {
    out.inflation_model = "replacement_slots_v2";
  }
  const auction_curve_model = src.auction_curve_model ?? src.auctionCurveModel;
  if (
    auction_curve_model === "linear_v1" ||
    auction_curve_model === "tiered_surplus_v1" ||
    auction_curve_model === "adaptive_surplus_v1"
  ) {
    out.auction_curve_model = auction_curve_model;
  }
  const auction_curve_reason = src.auction_curve_reason ?? src.auctionCurveReason;
  if (typeof auction_curve_reason === "string") {
    out.auction_curve_reason = auction_curve_reason;
  }
  if (isRecord(src.curve_inputs)) out.curve_inputs = src.curve_inputs;
  if (isRecord(src.curve_guardrails)) out.curve_guardrails = src.curve_guardrails;
  if (Array.isArray(src.curve_guardrails_applied)) {
    out.curve_guardrails_applied = src.curve_guardrails_applied;
  }
  const tls = readFinite(src.top10_linear_spread ?? src.top10LinearSpread);
  if (tls !== undefined) out.top10_linear_spread = tls;
  if (isRecord(src.selected_weights)) out.selected_weights = src.selected_weights;
  const scd = readFinite(src.surplus_conservation_delta ?? src.surplusConservationDelta);
  if (scd !== undefined) out.surplus_conservation_delta = scd;
  const iam = src.internal_allocation_mode ?? src.internalAllocationMode;
  if (typeof iam === "string") out.internal_allocation_mode = iam;
  if (inflation_index_vs_opening_auction !== undefined) {
    out.inflation_index_vs_opening_auction = inflation_index_vs_opening_auction;
  }
  if (total_budget_remaining !== undefined) {
    out.total_budget_remaining = total_budget_remaining;
  }
  if (players_remaining !== undefined) {
    out.players_remaining = players_remaining;
  }

  const ut =
    typeof src.user_team_id_used === "string"
      ? src.user_team_id_used
      : typeof src.userTeamIdUsed === "string"
        ? src.userTeamIdUsed
        : undefined;
  if (ut) out.user_team_id_used = ut;

  const mvRaw =
    src.valuation_model_version ??
    src.model_version ??
    src.valuationModelVersion ??
    src.modelVersion;
  if (typeof mvRaw === "string" && mvRaw.trim()) {
    out.model_version = mvRaw.trim();
  }

  const dpi = src.draftable_player_ids ?? src.draftablePlayerIds;
  if (Array.isArray(dpi) && dpi.length) {
    out.draftable_player_ids = dpi.map((x) =>
      typeof x === "number" && Number.isFinite(x)
        ? String(Math.trunc(x))
        : String(x).trim(),
    );
  }
  const dps = readFinite(src.draftable_pool_size ?? src.draftablePoolSize);
  if (dps !== undefined) out.draftable_pool_size = Math.trunc(dps);

  const mn = src.market_notes ?? src.marketNotes;
  if (Array.isArray(mn)) {
    out.market_notes = mn.filter(
      (x): x is string => typeof x === "string" && x.trim() !== "",
    );
  }

  const vcw = src.valuation_context_warnings ?? src.valuationContextWarnings;
  if (Array.isArray(vcw)) {
    out.valuation_context_warnings = vcw.filter(
      (x): x is string => typeof x === "string" && x.trim() !== "",
    );
  }

  const vctx = src.valuation_context ?? src.valuationContext;
  if (isRecord(vctx)) out.valuation_context = { ...vctx };

  const cv2raw = src.context_v2 ?? src.contextV2;
  const cv2 = shapeContextV2ForDraft(
    isRecord(cv2raw) ? cv2raw : undefined,
  );
  if (cv2) out.context_v2 = cv2;

  if (mergedScoring.length > 0) {
    out.scoring_category_warnings = mergedScoring;
  }

  const p = src.player;
  if (p && isRecord(p)) {
    out.player = shapeRowForDraft(p, {
      stripExplainScoringWarnings: stripExplainWarnings,
    });
  }

  if (typeof src.player_id === "string" && src.player_id.trim()) {
    out.player_id = src.player_id.trim();
  }

  if (options.debug) {
    out.diagnostics = { engine_response: JSON.parse(JSON.stringify(src)) };
  }

  return out;
}

export function parseDraftValuationDebugQuery(query: {
  debug?: unknown;
  detail?: unknown;
}): boolean {
  const flag = (v: unknown) =>
    v === "1" ||
    v === "true" ||
    v === 1 ||
    v === true;
  return flag(query.debug) || flag(query.detail);
}
