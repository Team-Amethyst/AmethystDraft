import type { ValuationPlayerResponse, ValuationResponse, ValuationResult } from "./engine";

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

/** Same six money fields + `all_keys` for pipeline logs (A–F). */
export function valuationRowPipelineSnapshot(
  row: ValuationResult | null | undefined,
): {
  player_id: string | null;
  recommended_bid: number | null;
  team_adjusted_value: number | null;
  edge: number | null;
  adjusted_value: number | null;
  baseline_value: number | null;
  all_keys: string[];
} | null {
  if (!row) return null;
  return {
    player_id: row.player_id ?? null,
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
  recommended_bid: number | null;
  team_adjusted_value: number | null;
  edge: number | null;
  adjusted_value: number | null;
  baseline_value: number | null;
  all_keys: string[];
} | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rb = readFiniteFromRecord(r, ["recommended_bid", "recommendedBid"]);
  const ta = readFiniteFromRecord(r, ["team_adjusted_value", "teamAdjustedValue"]);
  const edge = readFiniteFromRecord(r, ["edge"]);
  const adj = readFiniteFromRecord(r, ["adjusted_value", "adjustedValue"]);
  const base = readFiniteFromRecord(r, ["baseline_value", "baselineValue"]);
  return {
    player_id: String(r.player_id ?? r.playerId ?? "").trim() || null,
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
      recommended_bid: r.recommended_bid,
      team_adjusted_value: r.team_adjusted_value,
      edge: r.edge,
      adjusted_value: r.adjusted_value,
      baseline_value: r.baseline_value,
    },
    literal_camel: {
      playerId: r.playerId,
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
  const tier = readFiniteFromRecord(row, ["tier"]) ?? 0;
  const baseline_value =
    readFiniteFromRecord(row, ["baseline_value", "baselineValue"]) ?? 0;
  const adjusted_value =
    readFiniteFromRecord(row, ["adjusted_value", "adjustedValue"]) ?? 0;
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
    tier,
    baseline_value,
    adjusted_value,
    indicator,
  };
  if (recommended_bid !== undefined) out.recommended_bid = recommended_bid;
  if (team_adjusted_value !== undefined) out.team_adjusted_value = team_adjusted_value;
  if (edge !== undefined) out.edge = edge;

  const adp = readFiniteFromRecord(row, ["adp"]);
  if (adp !== undefined) out.adp = adp;

  const inflation_model = row.inflation_model;
  if (inflation_model === "replacement_slots_v2") {
    out.inflation_model = inflation_model;
  }

  if (row.explain_v2 && typeof row.explain_v2 === "object") {
    out.explain_v2 = row.explain_v2 as ValuationResult["explain_v2"];
  }
  if (Array.isArray(row.why)) out.why = row.why as string[];
  if (typeof row.team === "string") out.team = row.team;

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
