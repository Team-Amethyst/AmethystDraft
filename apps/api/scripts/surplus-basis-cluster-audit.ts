/**
 * Targeted surplus-basis audit (read-only). Demo league + explain_valuation_rows.
 *
 *   cd apps/api && pnpm exec tsx scripts/surplus-basis-cluster-audit.ts
 *   cd apps/api && pnpm exec tsx scripts/surplus-basis-cluster-audit.ts --json /tmp/surplus-audit.json
 */
import "dotenv/config";
import fs from "node:fs";
import mongoose from "mongoose";
import League from "../src/models/League";
import RosterEntry from "../src/models/RosterEntry";
import {
  buildValuationContext,
  finalizeEngineValuationPostPayload,
} from "../src/lib/engineContext";
import { resolveAuctionCurveModelForDraftRequest } from "../src/lib/auctionCurveModel";
import { amethyst } from "../src/lib/amethyst";
import { isReserveRosterSlot } from "../src/lib/demoLeagueFixtureGolden";

const SUSPICIOUS = [
  "José Ramírez",
  "Jose Ramirez",
  "Vladimir Guerrero Jr.",
  "Gunnar Henderson",
  "Cal Raleigh",
  "Pete Alonso",
  "Nick Kurtz",
  "Junior Caminero",
  "Yordan Alvarez",
  "Roman Anthony",
];

const COMPARABLES = [
  "Julio Rodríguez",
  "Julio Rodriguez",
  "Bobby Witt Jr.",
  "Aaron Judge",
  "Tarik Skubal",
  "Jarren Duran",
  "Riley Greene",
  "Drew Rasmussen",
  "Bryan Woo",
];

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function bestSurplusSlot(
  baseline: number,
  tokens: string[],
  repl: Record<string, number>,
): { slot: string | null; surplus: number; replacement: number | null } {
  let bestSlot: string | null = null;
  let best = 0;
  let bestRepl: number | null = null;
  for (const [slot, r] of Object.entries(repl)) {
    if (!tokens.some((t) => slotFits(slot, t, tokens))) continue;
    const s = baseline - r;
    if (s > best) {
      best = s;
      bestSlot = slot;
      bestRepl = r;
    }
  }
  return {
    slot: bestSlot,
    surplus: Math.max(0, best),
    replacement: bestRepl,
  };
}

/** Rough fit: slot key vs eligibility tokens (audit-only). */
function slotFits(slotKey: string, _token: string, tokens: string[]): boolean {
  const tset = new Set(tokens.map((x) => x.toUpperCase()));
  const sk = slotKey.toUpperCase();
  if (sk === "UTIL" || sk.startsWith("UTIL")) return true;
  if (sk === "P" || sk === "SP" || sk === "RP")
    return tset.has("SP") || tset.has("RP") || tset.has("P");
  if (sk.startsWith("OF")) return tset.has("OF");
  if (sk.startsWith("SS")) return tset.has("SS");
  if (sk.startsWith("2B")) return tset.has("2B");
  if (sk.startsWith("3B")) return tset.has("3B");
  if (sk.startsWith("1B")) return tset.has("1B");
  if (sk.startsWith("C")) return tset.has("C");
  if (sk.startsWith("MI")) return tset.has("2B") || tset.has("SS");
  if (sk.startsWith("CI")) return tset.has("1B") || tset.has("3B");
  return tset.has(sk.replace(/\d+$/, ""));
}

function matchCluster(name: string, list: string[]): boolean {
  const n = name.normalize("NFD").replace(/\p{M}/gu, "");
  return list.some((x) => {
    const y = x.normalize("NFD").replace(/\p{M}/gu, "");
    return n.includes(y) || y.includes(n) || name === x;
  });
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI required");
  const outJson = process.argv.includes("--json")
    ? process.argv[process.argv.indexOf("--json") + 1]
    : null;

  await mongoose.connect(uri);
  const league =
    (await League.findOne({ name: /\[Demo\].*pre\s*draft/i })
      .sort({ updatedAt: -1 })
      .lean()) ??
    (await League.findOne({ name: /\[Demo\]/i }).sort({ updatedAt: -1 }).lean());
  if (!league) throw new Error("No demo league");

  const entries = await RosterEntry.find({ leagueId: league._id }).lean();
  const context = await buildValuationContext(
    league as Parameters<typeof buildValuationContext>[0],
    entries as Parameters<typeof buildValuationContext>[1],
    {
      user_team_id: "team_1",
      auctionCurveModel: resolveAuctionCurveModelForDraftRequest({}),
      deterministic: true,
      seed: 42,
    },
  );

  const payload = {
    ...finalizeEngineValuationPostPayload(context),
    explain_valuation_rows: true,
  } as Record<string, unknown>;

  const { data } = await amethyst.post("/valuation/calculate", payload);
  const resp = data as Record<string, unknown>;
  const valuations = (resp.valuations ?? []) as Record<string, unknown>[];
  const draftableIds = new Set(
    ((resp.draftable_player_ids ?? []) as string[]).map(String),
  );
  const repl =
    (resp.replacement_values_by_slot_or_position as Record<string, number>) ??
    {};

  const bySb = [...valuations]
    .map((v) => ({
      id: str(v.player_id),
      sb: num(
        (v.valuation_explain as Record<string, unknown> | undefined)
          ?.surplus_basis ?? v.debug_v2?.surplus_basis,
      ),
    }))
    .filter((x) => x.sb != null && draftableIds.has(x.id))
    .sort((a, b) => (b.sb ?? 0) - (a.sb ?? 0));
  const sbRank = new Map<string, number>();
  bySb.forEach((x, i) => sbRank.set(x.id, i + 1));

  const withAdp = valuations.filter((v) => num(v.market_adp) != null);
  withAdp.sort(
    (a, b) => (num(a.market_adp) ?? 999) - (num(b.market_adp) ?? 999),
  );
  const adpRank = new Map<string, number>();
  withAdp.forEach((v, i) => adpRank.set(str(v.player_id), i + 1));

  function rowFor(v: Record<string, unknown>) {
    const ve = (v.valuation_explain ?? {}) as Record<string, unknown>;
    const bc = (v.baseline_components ?? {}) as Record<string, unknown>;
    const pid = str(v.player_id);
    const baseline = num(v.baseline_value) ?? 0;
    const tokens = (ve.effective_positions as string[] | undefined) ?? [];
    const best = bestSurplusSlot(baseline, tokens, repl);
    return {
      player_id: pid,
      name: str(v.name),
      position: str(v.position),
      mlb_team: str(v.team),
      market_adp: num(v.market_adp),
      market_adp_rank: adpRank.get(pid) ?? null,
      catalog_rank: num(v.catalog_rank),
      baseline_value: num(v.baseline_value),
      auction_value: num(v.auction_value),
      auction_rank: num(v.auction_rank),
      surplus_basis: num(ve.surplus_basis),
      surplus_basis_rank: sbRank.get(pid) ?? null,
      replacement_key_used: str(ve.replacement_key_used) || null,
      replacement_value_used: num(ve.replacement_value_used),
      best_surplus_slot: best.slot,
      best_surplus_slot_replacement: best.replacement,
      effective_positions: tokens,
      auction_curve_tier: str(ve.auction_curve_tier) || null,
      auction_curve_weight: num(ve.auction_curve_weight),
      auction_tier: num(v.auction_tier),
      baseline_tier: num(v.baseline_tier),
      inflation_factor_row: num(ve.inflation_factor),
      in_draftable_pool: draftableIds.has(pid),
      drafted: false,
      keeper: false,
      projection_component: num(bc.projection_component),
      scarcity_component: num(bc.scarcity_component),
      age_depth_component: num(bc.age_depth_component),
      injury_risk_multiplier: num(bc.injury_risk_multiplier),
      depth_risk_multiplier: num(bc.depth_risk_multiplier),
      age_risk_multiplier: num(bc.age_risk_multiplier),
      durability_expectation: str(ve.durability_expectation) || null,
      two_way_role_selected: str(bc.two_way_role_selected) || null,
    };
  }

  const allNames = [...SUSPICIOUS, ...COMPARABLES];
  const cluster: Record<string, unknown>[] = [];
  const comparables: Record<string, unknown>[] = [];
  for (const v of valuations) {
    const name = str(v.name);
    const r = rowFor(v);
    if (matchCluster(name, SUSPICIOUS)) cluster.push(r);
    else if (matchCluster(name, COMPARABLES)) comparables.push(r);
  }

  const report = {
    league: league.name,
    engine_meta: {
      draftable_pool_size: resp.draftable_pool_size,
      remaining_slots: resp.remaining_slots,
      inflation_factor: resp.inflation_factor,
      surplus_cash: resp.surplus_cash,
      total_surplus_mass: resp.total_surplus_mass,
      auction_curve_model: resp.auction_curve_model,
      min_bid: resp.min_bid,
    },
    replacement_values_by_slot: repl,
    suspicious_cluster: cluster,
    high_dollar_comparables: comparables,
  };

  if (outJson) fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
