import "dotenv/config";
import fs from "node:fs";
import mongoose from "mongoose";
import RosterEntry from "../src/models/RosterEntry";
import {
  resolveDemoKeeperPreDraftLeague,
  resolveFriendlyLeagueForAudit,
  resolveOriginalDemoLeague,
} from "../src/lib/canonicalAuditLeagues";
import {
  buildValuationContext,
  finalizeEngineValuationPostPayload,
  valuationIncomingToEngineContext,
} from "../src/lib/engineContext";
import { resolveAuctionCurveModelForDraftRequest } from "../src/lib/auctionCurveModel";
import { amethyst } from "../src/lib/amethyst";
import { readCheckpointFixtureJson } from "../src/lib/engineCheckpointCatalog";
import { valuationIncomingSchema } from "../src/validation/schemas";

const TRACKED = [
  "Shohei Ohtani",
  "Tarik Skubal",
  "Garrett Crochet",
  "Hunter Brown",
  "Yoshinobu Yamamoto",
  "Bryan Woo",
  "Aaron Judge",
  "Juan Soto",
  "Julio Rodríguez",
  "Corbin Carroll",
  "Fernando Tatis Jr.",
  "Bobby Witt Jr.",
  "José Ramírez",
  "Vladimir Guerrero Jr.",
  "Gunnar Henderson",
  "Cal Raleigh",
  "Jarren Duran",
  "Andy Pages",
  "Addison Barger",
  "Kyle Tucker",
  "Freddie Freeman",
  "Pete Alonso",
  "Elly De La Cruz",
  "Ronald Acuña Jr.",
  "Mookie Betts",
  "Spencer Jones",
  "Camilo Doval",
  "Will Warren",
];

const ELITE_HITTERS = new Set([
  "Shohei Ohtani",
  "Aaron Judge",
  "Juan Soto",
  "Julio Rodríguez",
  "Corbin Carroll",
  "Fernando Tatis Jr.",
  "Bobby Witt Jr.",
  "José Ramírez",
  "Vladimir Guerrero Jr.",
  "Gunnar Henderson",
  "Kyle Tucker",
  "Freddie Freeman",
  "Pete Alonso",
  "Elly De La Cruz",
  "Ronald Acuña Jr.",
  "Mookie Betts",
]);

const ELITE_PITCHERS = new Set([
  "Tarik Skubal",
  "Garrett Crochet",
  "Hunter Brown",
  "Yoshinobu Yamamoto",
  "Bryan Woo",
]);

const EXPENSIVE_KEEPERS = [
  { player_id: "596019", name: "Francisco Lindor", position: "SS", paid: 88 },
  { player_id: "643377", name: "Garrett Crochet", position: "P", paid: 71 },
  { player_id: "607208", name: "Trea Turner", position: "SS", paid: 83 },
  { player_id: "543807", name: "George Springer", position: "OF", paid: 20 },
];

type AnyRow = Record<string, any>;
let playerEndpointParityChecksRemaining = 24;

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function userTier(value: number | null | undefined): string {
  const v = Number(value ?? 0);
  if (!Number.isFinite(v) || v < 1) return "T5";
  if (v >= 25) return "T1";
  if (v >= 15) return "T2";
  if (v >= 10) return "T3";
  if (v >= 5) return "T4";
  return "T5";
}

function positionsOf(row: AnyRow): string[] {
  const ex = row.valuation_explain ?? {};
  const effective = ex.effective_positions;
  if (Array.isArray(effective) && effective.length) return effective.map(String);
  const pos = row.position ?? row.positions;
  if (Array.isArray(pos)) return pos.map(String);
  if (typeof pos === "string" && pos.length) return pos.split(/[\/,]/).map((p) => p.trim());
  return [];
}

function isPitcher(row: AnyRow): boolean {
  const positions = positionsOf(row).map((p) => p.toUpperCase());
  return positions.some((p) => p === "P" || p === "SP" || p === "RP");
}

function countPositions(rows: AnyRow[]) {
  const counts: Record<string, number> = {
    C: 0,
    "1B": 0,
    "2B": 0,
    SS: 0,
    "3B": 0,
    OF: 0,
    SP: 0,
    RP: 0,
  };
  let hitters = 0;
  let pitchers = 0;
  let multi = 0;
  for (const row of rows) {
    const positions = [...new Set(positionsOf(row).map((p) => p.toUpperCase()))];
    if (positions.length > 1) multi += 1;
    if (positions.some((p) => p === "P" || p === "SP" || p === "RP")) pitchers += 1;
    else hitters += 1;
    for (const key of Object.keys(counts)) {
      if (positions.includes(key)) counts[key] += 1;
      else if (key === "SP" && positions.includes("P")) counts[key] += 1;
    }
  }
  const domination = Object.entries(counts)
    .filter(([, count]) => rows.length > 0 && count / rows.length >= 0.7)
    .map(([position, count]) => ({ position, count }));
  return { hitters, pitchers, multi_position: multi, counts, domination };
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return Number(sorted[lo]!.toFixed(2));
  const blended = sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
  return Number(blended.toFixed(2));
}

function shelfCounts(values: number[]) {
  const rounded = new Map<number, number>();
  for (const v of values) rounded.set(Math.round(v), (rounded.get(Math.round(v)) ?? 0) + 1);
  const roundedShelves = [...rounded.entries()]
    .filter(([, count]) => count >= 3)
    .map(([dollar, count]) => ({ dollar, count }))
    .sort((a, b) => b.count - a.count || b.dollar - a.dollar);

  const rawShelves: { anchor: number; count: number }[] = [];
  for (let i = 0; i < values.length; i++) {
    const anchor = values[i]!;
    const count = values.filter((v) => Math.abs(v - anchor) <= 0.25).length;
    if (count >= 3 && !rawShelves.some((s) => Math.abs(s.anchor - anchor) <= 0.25)) {
      rawShelves.push({ anchor: Number(anchor.toFixed(2)), count });
    }
  }
  rawShelves.sort((a, b) => b.count - a.count || b.anchor - a.anchor);
  return { rounded: roundedShelves.slice(0, 12), raw: rawShelves.slice(0, 12) };
}

function rosterEntries(leagueId: any, picks: AnyRow[]) {
  const userId = new mongoose.Types.ObjectId();
  return picks.map((p) => ({
    _id: new mongoose.Types.ObjectId(),
    leagueId,
    userId,
    teamId: p.team_id,
    externalPlayerId: p.player_id,
    playerName: p.name,
    playerTeam: p.team ?? "",
    positions: p.positions ?? [],
    price: p.paid ?? 0,
    rosterSlot: p.roster_slot ?? p.positions?.[0] ?? "UTIL",
    isKeeper: false,
    acquiredAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

function rosteredStatus(payload: AnyRow) {
  const out = new Map<string, { status: "drafted" | "keeper"; paid: number | null }>();
  for (const p of payload.drafted_players ?? []) {
    out.set(String(p.player_id), { status: p.is_keeper ? "keeper" : "drafted", paid: p.paid ?? null });
  }
  for (const team of payload.pre_draft_rosters ?? []) {
    for (const p of team.players ?? []) {
      out.set(String(p.player_id), { status: "keeper", paid: p.paid ?? null });
    }
  }
  return out;
}

function rowSummary(row: AnyRow, draftable: Set<string>, rostered: Map<string, { status: string; paid: number | null }>) {
  const ex = row.valuation_explain ?? {};
  const id = String(row.player_id);
  const status = rostered.get(id);
  return {
    player_id: id,
    rank: row.auction_rank ?? null,
    name: row.name ?? null,
    team: row.team ?? row.mlb_team ?? null,
    positions: positionsOf(row),
    auction_value: row.auction_value ?? null,
    display: typeof row.auction_value === "number" ? Math.round(row.auction_value) : null,
    tier: userTier(row.auction_value),
    engine_tier: row.auction_tier ?? null,
    baseline_value: row.baseline_value ?? null,
    surplus_basis: ex.surplus_basis ?? null,
    pricing_slot: ex.replacement_key_used ?? null,
    replacement_line: ex.replacement_value_used ?? null,
    guard: Boolean(ex.surplus_guard_lift),
    guard_name: ex.surplus_guard_name ?? null,
    guard_lift: ex.surplus_guard_lift ?? 0,
    slot_only_surplus_basis: ex.slot_only_surplus_basis ?? null,
    curve_tier: ex.auction_curve_tier ?? null,
    curve_weight: ex.auction_curve_weight ?? null,
    pool_status: draftable.has(id) ? "active_pool" : status?.status ?? "outside_pool",
    paid: status?.paid ?? null,
  };
}

async function post(payload: AnyRow) {
  const { data } = await amethyst.post("/valuation/calculate", payload);
  return data;
}

async function postPlayer(payload: AnyRow, playerId: string) {
  const { data } = await amethyst.post("/valuation/player", {
    ...payload,
    player_id: playerId,
  });
  return data.player ?? data.valuations?.[0] ?? null;
}

async function evaluateState(stateId: string, payload: AnyRow) {
  const raw = await post(payload);
  const draftable = new Set((raw.draftable_player_ids ?? []).map(String));
  const rostered = rosteredStatus(payload);
  const activeRows = [...(raw.valuations ?? [])]
    .filter((row) => draftable.has(String(row.player_id)))
    .sort((a, b) => (b.auction_value ?? 0) - (a.auction_value ?? 0));
  const top50 = activeRows.slice(0, 50).map((row) => rowSummary(row, draftable, rostered));
  const byName = new Map((raw.valuations ?? []).map((row: AnyRow) => [norm(row.name ?? ""), row]));

  const tracked = TRACKED.map((name) => {
    const row = byName.get(norm(name));
    if (!row) {
      return {
        name,
        rank: null,
        auction_value: null,
        display: null,
        tier: null,
        pool: false,
        rostered: false,
        reason: "missing from valuation response",
      };
    }
    const id = String(row.player_id);
    const status = rostered.get(id);
    const active = draftable.has(id);
    let reason: string | null = null;
    if (!active && status) reason = status.status;
    else if (!active) reason = "outside active draftable pool";
    else if ((row.auction_value ?? 0) <= 1.01) reason = "min-bid or replacement/fringe value";
    return {
      ...rowSummary(row, draftable, rostered),
      name,
      rank: row.auction_rank ?? null,
      auction_value: row.auction_value ?? null,
      display: typeof row.auction_value === "number" ? Math.round(row.auction_value) : null,
      tier: active ? userTier(row.auction_value) : null,
      pool: active,
      rostered: Boolean(status),
      reason,
    };
  });

  const values = activeRows.map((row) => Number(row.auction_value ?? 0));
  const drops = (limit: number) =>
    activeRows.slice(0, limit - 1).map((row, i) => ({
      from_rank: i + 1,
      from: row.name,
      to: activeRows[i + 1]?.name,
      drop: Number(((row.auction_value ?? 0) - (activeRows[i + 1]?.auction_value ?? 0)).toFixed(2)),
    }));
  const largestDrop = (limit: number) =>
    drops(limit).sort((a, b) => b.drop - a.drop)[0] ?? null;
  const top = values[0] ?? 0;
  const counts = {
    above_35: values.filter((v) => v > 35).length,
    above_30: values.filter((v) => v > 30).length,
    above_25: values.filter((v) => v > 25).length,
    above_20: values.filter((v) => v > 20).length,
    above_15: values.filter((v) => v > 15).length,
    above_10: values.filter((v) => v > 10).length,
    above_5: values.filter((v) => v > 5).length,
    above_1: values.filter((v) => v > 1).length,
  };
  const tierCounts = { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 } as Record<string, number>;
  for (const value of values) tierCounts[userTier(value)] += 1;

  const curve = {
    max: Number((values[0] ?? 0).toFixed(2)),
    top5_avg: Number((values.slice(0, 5).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(5, values.length))).toFixed(2)),
    top10_avg: Number((values.slice(0, 10).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(10, values.length))).toFixed(2)),
    top25_avg: Number((values.slice(0, 25).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(25, values.length))).toFixed(2)),
    median: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p25: percentile(values, 0.25),
    counts,
    tier_counts: tierCounts,
    largest_drop_top25: largestDrop(25),
    largest_drop_top75: largestDrop(75),
    shelves: shelfCounts(values),
    cap_shelf_count: values.filter((v) => Math.abs(v - top) <= 0.6).length,
    plateau_48_count: values.filter((v) => v >= 47.5 && v <= 48.5).length,
    endgame_above_20_count: stateId.includes("after_pick_100") || stateId.includes("endgame")
      ? values.filter((v) => v > 20).length
      : null,
  };

  const position_distribution = {
    top10: countPositions(activeRows.slice(0, 10)),
    top25: countPositions(activeRows.slice(0, 25)),
    top50: countPositions(activeRows.slice(0, 50)),
  };

  const guardAudit = activeRows
    .map((row) => rowSummary(row, draftable, rostered))
    .filter((row) => {
      const lift = Number(row.guard_lift ?? 0);
      const hybrid = Number(row.surplus_basis ?? 0) - Number(row.slot_only_surplus_basis ?? row.surplus_basis ?? 0) - lift;
      return lift > 0.01 || hybrid > 0.01 || row.curve_tier != null;
    })
    .slice(0, 80)
    .map((row) => {
      const lift = Number(row.guard_lift ?? 0);
      const hybrid = Number(row.surplus_basis ?? 0) - Number(row.slot_only_surplus_basis ?? row.surplus_basis ?? 0) - lift;
      return {
        name: row.name,
        rank: row.rank,
        baseline_value: row.baseline_value,
        slot_only_surplus_basis: row.slot_only_surplus_basis,
        guard_name: row.guard_name,
        guard_lift: lift,
        inferred_hybrid_lift: Number(Math.max(0, hybrid).toFixed(4)),
        final_surplus_basis: row.surplus_basis,
        auction_value: row.auction_value,
        curve_tier: row.curve_tier,
        truly_elite_or_high_baseline: Number(row.baseline_value ?? 0) >= 55,
      };
    });

  const top25Names = new Set(activeRows.slice(0, 25).map((r) => String(r.name)));
  const anomalies: string[] = [];
  if (position_distribution.top10.pitchers >= 9) anomalies.push("top10 almost all pitchers");
  if (stateId.includes("true_empty") && ![...ELITE_HITTERS].some((n) => top25Names.has(n))) {
    anomalies.push("elite hitters missing from top25");
  }
  if (!stateId.includes("after_pick_100") && ![...ELITE_PITCHERS].some((n) => top25Names.has(n))) {
    anomalies.push("elite SPs missing from top25");
  }
  if (activeRows.slice(0, 25).some((r) => positionsOf(r).includes("RP") && Number(r.baseline_value ?? 0) < 50)) {
    anomalies.push("RP/depth player appears in top25");
  }
  const judge = byName.get(norm("Aaron Judge"));
  if (judge && draftable.has(String(judge.player_id))) {
    const judgeRank = Number(judge.auction_rank ?? 9999);
    const suspect = activeRows
      .filter((r) => positionsOf(r).includes("OF"))
      .find((r) => Number(r.auction_rank ?? 9999) < judgeRank && Number(r.baseline_value ?? 0) + 8 < Number(judge.baseline_value ?? 0));
    if (suspect) anomalies.push(`Judge below lower-baseline OF ${suspect.name}`);
  }
  if (curve.largest_drop_top25 && curve.largest_drop_top25.drop >= 8) anomalies.push("large adjacent drop in top25");
  if (curve.cap_shelf_count >= 5) anomalies.push("broad top cap shelf");
  if (curve.plateau_48_count > 0) anomalies.push("$48 plateau present");
  if (stateId.includes("after_pick_100") && Number(curve.endgame_above_20_count ?? 0) > 0) anomalies.push("endgame above $20");

  const parityRows =
    playerEndpointParityChecksRemaining > 0
      ? [
          ...activeRows.slice(0, 4),
          ...activeRows.slice(Math.max(0, Math.floor(activeRows.length / 2) - 2), Math.max(0, Math.floor(activeRows.length / 2) + 2)),
          ...activeRows.slice(-4),
        ].slice(0, playerEndpointParityChecksRemaining)
      : [];
  const parity = [];
  for (const row of parityRows) {
    const player = await postPlayer(payload, String(row.player_id));
    playerEndpointParityChecksRemaining -= 1;
    parity.push({
      name: row.name,
      rank: row.auction_rank,
      research_table: row.auction_value,
      command_center: row.auction_value,
      player_modal: player?.auction_value ?? null,
      player_endpoint: player?.auction_value ?? null,
      displayed_match:
        Math.round(row.auction_value ?? -1) === Math.round(player?.auction_value ?? -2),
      raw_delta: Number(((row.auction_value ?? 0) - (player?.auction_value ?? 0)).toFixed(4)),
    });
  }

  const tierMakeup = buildTierMakeup(raw.valuations ?? [], draftable, rostered);

  const draftedAudit = buildDraftedPlayerAudit(payload, raw, draftable);

  const acceptance = evaluateAcceptance(stateId, {
    curve_reason: raw.auction_curve_reason,
    curve,
    tier_counts: curve.tier_counts,
    position_distribution: position_distribution,
    tracked,
    top50,
    anomalies,
    draftedAudit,
    pool: draftable.size,
  });

  return {
    state_id: stateId,
    curve_reason: raw.auction_curve_reason,
    internal_mode: raw.internal_allocation_mode,
    pool: draftable.size,
    remaining_slots: raw.remaining_slots,
    surplus_cash: raw.surplus_cash,
    total_surplus_mass: raw.total_surplus_mass,
    inflation_factor: raw.inflation_factor,
    top50,
    tracked,
    curve,
    position_distribution,
    guard_audit: guardAudit,
    parity,
    anomalies,
    tier_makeup: tierMakeup,
    drafted_player_audit: draftedAudit,
    acceptance,
  };
}

function buildTierMakeup(valuations: AnyRow[], draftable: Set<string>, rostered: Map<string, { status: string; paid: number | null }>) {
  const tiers = ["T1", "T2", "T3", "T4", "T5"] as const;
  const out: Record<string, any> = {};
  for (const tier of tiers) {
    const available = valuations.filter(
      (v) => draftable.has(String(v.player_id)) && userTier(v.auction_value) === tier
    );
    const drafted = valuations.filter((v) => {
      const id = String(v.player_id);
      return rostered.has(id) && !draftable.has(id);
    });
    const values = available.map((v) => Number(v.auction_value ?? 0)).filter((v) => v >= 1);
    const sortedAvail = [...available].sort((a, b) => (b.auction_value ?? 0) - (a.auction_value ?? 0));
    out[tier] = {
      available_count: available.length,
      drafted_count: drafted.length,
      top15_names: sortedAvail.slice(0, 15).map((v) => v.name),
      bottom10_names: sortedAvail.slice(-10).map((v) => v.name),
      hitter_pitcher: countPositions(available),
      raw_min: values.length ? Math.min(...values) : null,
      raw_median: percentile(values, 0.5),
      raw_max: values.length ? Math.max(...values) : null,
      raw_avg: values.length
        ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2))
        : null,
    };
  }
  return out;
}

function buildDraftedPlayerAudit(payload: AnyRow, raw: AnyRow, draftable: Set<string>) {
  const drafted = (payload.drafted_players ?? []) as AnyRow[];
  const checks = drafted.map((p: AnyRow) => {
    const id = String(p.player_id);
    const inPool = draftable.has(id);
    const row = (raw.valuations ?? []).find((v: AnyRow) => String(v.player_id) === id);
    return {
      player_id: id,
      name: p.name,
      paid: p.paid ?? null,
      in_draftable_pool: inPool,
      in_valuations_array: Boolean(row),
      auction_value_on_row: row?.auction_value ?? null,
    };
  });
  return {
    drafted_count: drafted.length,
    all_excluded_from_draftable: checks.every((c) => !c.in_draftable_pool),
    picks: checks,
  };
}

function evaluateAcceptance(
  stateId: string,
  ctx: {
    curve_reason: string;
    curve: AnyRow;
    tier_counts: Record<string, number>;
    position_distribution: AnyRow;
    tracked: AnyRow[];
    top50: AnyRow[];
    anomalies: string[];
    draftedAudit: AnyRow;
    pool: number;
  }
) {
  const notes: string[] = [];
  let pass = ctx.anomalies.length === 0;

  if (stateId === "true_empty_0_picks") {
    if (!ctx.curve_reason.includes("fresh_empty_opening")) notes.push("expected fresh_empty_opening_tiered");
    if (ctx.curve.max < 28 || ctx.curve.max > 36) notes.push(`max ${ctx.curve.max} outside 28-36 band`);
    if ((ctx.tier_counts.T1 ?? 0) < 4) notes.push("T1 count low for fresh empty");
    if (ctx.curve.cap_shelf_count >= 5) pass = false;
  }
  if (stateId === "true_empty_1_picks") {
    if (!ctx.curve_reason.includes("early_auction")) notes.push("expected early_auction curve");
    if (ctx.curve.max < 25) notes.push(`1-pick max ${ctx.curve.max} below 25 (no cliff)`);
    if ((ctx.tier_counts.T1 ?? 0) < 10) notes.push("T1 should stay populated at 1 pick");
    if (!ctx.draftedAudit.all_excluded_from_draftable) notes.push("drafted player still in draftable pool");
  }
  if (stateId === "true_empty_5_picks" || stateId === "true_empty_10_picks") {
    if (!ctx.curve_reason.includes("early_auction")) notes.push("expected early_auction curve");
    for (const name of ["Aaron Judge", "Juan Soto", "Julio Rodríguez", "Corbin Carroll"]) {
      const t = ctx.tracked.find((x) => x.name === name);
      if (t && (t.tier === "T5" || (t.rank != null && t.rank > 50))) {
        notes.push(`${name} still T5 or very low at ${stateId}`);
        pass = false;
      }
    }
    const barger = ctx.tracked.find((x) => x.name === "Addison Barger");
    const judge = ctx.tracked.find((x) => x.name === "Aaron Judge");
    if (barger && judge && barger.pool && judge.pool && (barger.rank ?? 999) < (judge.rank ?? 999) && (barger.auction_value ?? 0) > (judge.auction_value ?? 0)) {
      notes.push("Barger above Judge without clear scarcity reason");
      pass = false;
    }
    if (stateId === "true_empty_10_picks" && ctx.position_distribution.top10.pitchers >= 9) {
      notes.push("top10 overwhelmingly SP");
      pass = false;
    }
  }
  if (stateId === "true_empty_25_picks") {
    if (!ctx.curve_reason.includes("linear") && !ctx.curve_reason.includes("early")) {
      notes.push("expected linear or late early transition at 25 picks");
    }
  }
  if (stateId === "original_demo_empty") {
    if (!ctx.curve_reason.includes("keeper_compressed") && !ctx.curve_reason.includes("demo")) {
      notes.push(`original curve: ${ctx.curve_reason}`);
    }
  }
  if (stateId === "demo_keeper_pre_draft") {
    const judge = ctx.tracked.find((x) => x.name === "Aaron Judge");
    const woo = ctx.tracked.find((x) => x.name === "Bryan Woo");
    if (judge && judge.pool && (judge.auction_value ?? 0) < 20) pass = false;
    if (woo && woo.pool && (woo.auction_value ?? 0) > 15) pass = false;
    const jones = ctx.tracked.find((x) => x.name === "Spencer Jones");
    if (jones && jones.pool) pass = false;
  }
  if (stateId === "expensive_keeper_judge_collapse") {
    const judge = ctx.tracked.find((x) => x.name === "Aaron Judge");
    if (judge && (judge.auction_value ?? 0) < 18) pass = false;
    if (judge && (judge.auction_value ?? 0) > 40) pass = false;
  }
  if (stateId.includes("after_pick")) {
    if ((ctx.curve.plateau_48_count ?? 0) > 0) pass = false;
    if ((ctx.curve.endgame_above_20_count ?? 0) > 0) pass = false;
  }

  return { pass, notes, failures: notes.filter((n) => n.includes("fail") || n.includes("outside") || n.includes("T5") || n.includes("Barger") || n.includes("SP")).length };
}

async function payloadForLeague(stateId: string, league: any, entries: AnyRow[]) {
  const ctx = await buildValuationContext(league, entries, {
    userTeamId: "team_1",
    auctionCurveModel: resolveAuctionCurveModelForDraftRequest({}),
  });
  return finalizeEngineValuationPostPayload({
    ...ctx,
    deterministic: true,
    seed: 42,
    explain_valuation_rows: true,
  } as any);
}

async function payloadForCheckpoint(key: string, userTeamId = "team_1") {
  const checkpoint: any = readCheckpointFixtureJson(key as any);
  const ctx = valuationIncomingToEngineContext(valuationIncomingSchema.parse(checkpoint));
  return finalizeEngineValuationPostPayload({
    ...ctx,
    user_team_id: userTeamId,
    auction_curve_model: resolveAuctionCurveModelForDraftRequest({}),
    deterministic: true,
    seed: 42,
    explain_valuation_rows: true,
  } as any);
}

async function payloadForExpensiveKeeperFixture() {
  const checkpoint: any = readCheckpointFixtureJson("pre_draft" as any);
  const teamA = checkpoint.pre_draft_rosters?.find((t: AnyRow) => t.team_id === "team_a");
  for (const keeper of EXPENSIVE_KEEPERS) {
    if (!teamA?.players.some((p: AnyRow) => String(p.player_id) === keeper.player_id)) {
      teamA?.players.push({
        ...keeper,
        team: "UNK",
        team_id: "team_a",
        is_keeper: true,
      });
    }
  }
  const ctx = valuationIncomingToEngineContext(valuationIncomingSchema.parse(checkpoint));
  return finalizeEngineValuationPostPayload({
    ...ctx,
    user_team_id: "team_a",
    auction_curve_model: resolveAuctionCurveModelForDraftRequest({}),
    deterministic: true,
    seed: 42,
    explain_valuation_rows: true,
  } as any);
}

async function main() {
  const outArg = process.argv.find((arg) => arg.startsWith("--out="));
  const outPath = outArg?.slice("--out=".length);
  await mongoose.connect(process.env.MONGO_URI!);
  const friendly = await resolveFriendlyLeagueForAudit();
  const original = await resolveOriginalDemoLeague();
  const demoKeeper = await resolveDemoKeeperPreDraftLeague();
  const demoKeeperEntries = await RosterEntry.find({ leagueId: (demoKeeper as any)._id }).lean();
  const picks = ((readCheckpointFixtureJson("after_pick_50" as any) as any).draft_state ?? []).slice(0, 25);

  const states: { id: string; payload: AnyRow }[] = [];
  for (const n of [0, 1, 5, 10, 25]) {
    states.push({
      id: `true_empty_${n}_picks`,
      payload: await payloadForLeague(
        `true_empty_${n}_picks`,
        friendly,
        rosterEntries((friendly as any)._id, picks.slice(0, n)),
      ),
    });
  }
  states.push({ id: "original_demo_empty", payload: await payloadForLeague("original_demo_empty", original, []) });
  states.push({ id: "demo_keeper_pre_draft", payload: await payloadForLeague("demo_keeper_pre_draft", demoKeeper, demoKeeperEntries) });
  states.push({ id: "expensive_keeper_judge_collapse", payload: await payloadForExpensiveKeeperFixture() });
  states.push({ id: "after_pick_50", payload: await payloadForCheckpoint("after_pick_50") });
  states.push({ id: "after_pick_100_endgame", payload: await payloadForCheckpoint("after_pick_100") });

  await mongoose.disconnect();

  const rows = [];
  for (const state of states) {
    rows.push(await evaluateState(state.id, state.payload));
  }

  const report = {
    generated_at: new Date().toISOString(),
    engine: process.env.AMETHYST_API_BASE_URL ?? null,
    rows,
    summary: {
      state_count: rows.length,
      anomaly_count: rows.reduce((sum, row) => sum + row.anomalies.length, 0),
      acceptance_failures: rows.filter((row) => !row.acceptance.pass).map((row) => ({
        state_id: row.state_id,
        notes: row.acceptance.notes,
      })),
      parity_mismatches: rows.flatMap((row) =>
        row.parity.filter((p) => !p.displayed_match).map((p) => ({ state_id: row.state_id, ...p })),
      ),
    },
  };

  const text = JSON.stringify(report, null, 2);
  if (outPath) fs.writeFileSync(outPath, text);
  else console.log(text);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
