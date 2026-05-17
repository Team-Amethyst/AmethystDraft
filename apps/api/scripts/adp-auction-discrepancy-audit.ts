/**
 * ADP vs auction_value discrepancy audit (read-only).
 *
 *   cd apps/api && pnpm exec tsx scripts/adp-auction-discrepancy-audit.ts
 *   cd apps/api && pnpm exec tsx scripts/adp-auction-discrepancy-audit.ts --json tmp/adp-audit.json
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import League from "../src/models/League";
import RosterEntry from "../src/models/RosterEntry";
import {
  buildValuationContext,
  finalizeEngineValuationPostPayload,
  resolveLeagueNumTeams,
} from "../src/lib/engineContext";
import { resolveAuctionCurveModelForDraftRequest } from "../src/lib/auctionCurveModel";
import { amethyst } from "../src/lib/amethyst";
import { isReserveRosterSlot } from "../src/lib/demoLeagueFixtureGolden";

type ValRow = Record<string, unknown>;
type AuditRow = {
  player_id: string;
  name: string;
  mlb_team: string;
  position: string;
  market_adp: number | null;
  market_adp_rank: number | null;
  auction_rank: number | null;
  auction_value: number | null;
  baseline_value: number | null;
  team_value: number | null;
  recommended_bid: number | null;
  catalog_rank: number | null;
  surplus_basis: number | null;
  replacement_key_used: string | null;
  valuation_eligible: boolean;
  drafted: boolean;
  keeper: boolean;
  on_user_roster: boolean;
  rank_delta: number | null;
  adp_implied_value: number | null;
  value_delta: number | null;
  bucket: string | null;
};

const DEEP_DIVE_NAMES = [
  "José Ramírez",
  "Jose Ramirez",
  "Tarik Skubal",
  "Julio Rodríguez",
  "Julio Rodriguez",
  "Bobby Witt Jr.",
  "Jarren Duran",
  "Riley Greene",
  "Byron Buxton",
  "Cody Bellinger",
  "Aaron Judge",
  "Max Fried",
  "Garrett Crochet",
  "Cal Raleigh",
  "Andrés Muñoz",
  "Andres Munoz",
  "David Bednar",
  "Emmanuel Clase",
];

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function adpBucket(adpRank: number | null): string | null {
  if (adpRank == null) return null;
  if (adpRank <= 12) return "1-12";
  if (adpRank <= 24) return "13-24";
  if (adpRank <= 50) return "25-50";
  if (adpRank <= 75) return "51-75";
  if (adpRank <= 100) return "76-100";
  if (adpRank <= 150) return "101-150";
  if (adpRank <= 250) return "151-250";
  return "251+";
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function rankByField<T>(
  rows: T[],
  get: (r: T) => number | null,
  ascending: boolean,
): Map<T, number> {
  const sortable = rows.filter((r) => get(r) != null) as T[];
  sortable.sort((a, b) => {
    const av = get(a)!;
    const bv = get(b)!;
    return ascending ? av - bv : bv - av;
  });
  const out = new Map<T, number>();
  sortable.forEach((r, i) => out.set(r, i + 1));
  return out;
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

  if (!league) {
    console.error("No demo league in Mongo");
    process.exit(1);
  }

  const leagueId = league._id!.toString();
  const entries = await RosterEntry.find({ leagueId: league._id }).lean();
  const keeperIds = new Set(
    entries
      .filter((e) => e.isKeeper && !isReserveRosterSlot(e.rosterSlot ?? ""))
      .map((e) => String(e.playerId)),
  );
  const draftedIds = new Set(
    entries
      .filter((e) => !e.isKeeper && !isReserveRosterSlot(e.rosterSlot ?? ""))
      .map((e) => String(e.playerId)),
  );

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

  const payload = finalizeEngineValuationPostPayload(context) as Record<
    string,
    unknown
  >;
  const { data } = await amethyst.post("/valuation/calculate", payload);
  const resp = data as Record<string, unknown>;
  const valuations = (resp.valuations ?? []) as ValRow[];

  const valById = new Map<string, ValRow>();
  for (const v of valuations) {
    valById.set(str(v.player_id), v);
  }

  const playerIds = Array.isArray(payload.player_ids)
    ? (payload.player_ids as string[])
  : valuations.map((v) => str(v.player_id));

  const withAdp = valuations.filter((v) => num(v.market_adp) != null);
  const adpRankMap = rankByField(withAdp, (v) => num(v.market_adp), true);

  const auctionRankMap = rankByField(
    valuations.filter((v) => num(v.auction_value) != null),
    (v) => num(v.auction_value),
    false,
  );

  const bucketMedians = new Map<string, number>();
  for (const b of [
    "1-12",
    "13-24",
    "25-50",
    "51-75",
    "76-100",
    "101-150",
    "151-250",
    "251+",
  ]) {
    const vals: number[] = [];
    for (const v of withAdp) {
      const ar = adpRankMap.get(v);
      if (adpBucket(ar ?? null) !== b) continue;
      const av = num(v.auction_value);
      if (av != null) vals.push(av);
    }
    if (vals.length > 0) bucketMedians.set(b, median(vals));
  }

  const auditRows: AuditRow[] = [];

  for (const pid of playerIds) {
    const v = valById.get(pid);
    if (!v) continue;
    const marketAdp = num(v.market_adp);
    const adpRank = marketAdp != null ? (adpRankMap.get(v) ?? null) : null;
    const auctionRank = auctionRankMap.get(v) ?? num(v.auction_rank);
    const auctionValue = num(v.auction_value);
    const bucket = adpBucket(adpRank);
    const adpImplied =
      bucket != null ? (bucketMedians.get(bucket) ?? null) : null;
    const valueDelta =
      auctionValue != null && adpImplied != null
        ? auctionValue - adpImplied
        : null;
    const rankDelta =
      adpRank != null && auctionRank != null ? auctionRank - adpRank : null;

    auditRows.push({
      player_id: pid,
      name: str(v.name),
      mlb_team: str(v.team),
      position: str(v.position),
      market_adp: marketAdp,
      market_adp_rank: adpRank,
      auction_rank: auctionRank,
      auction_value: auctionValue,
      baseline_value: num(v.baseline_value),
      team_value: num(v.team_value ?? v.team_adjusted_value),
      recommended_bid: num(v.recommended_bid),
      catalog_rank: num(v.catalog_rank),
      surplus_basis: num(
        (v.valuation_explain as Record<string, unknown> | undefined)
          ?.surplus_basis ?? v.surplus_basis,
      ),
      replacement_key_used: str(
        (v.valuation_explain as Record<string, unknown> | undefined)
          ?.replacement_key_used ?? v.replacement_key_used,
      ) || null,
      valuation_eligible: v.valuation_eligible !== false,
      drafted: draftedIds.has(pid),
      keeper: keeperIds.has(pid),
      on_user_roster: entries.some(
        (e) => String(e.playerId) === pid && e.teamId === "team_1",
      ),
      rank_delta: rankDelta,
      adp_implied_value: adpImplied,
      value_delta: valueDelta,
      bucket,
    });
  }

  const flags = {
    highAdpLowDollars: [] as AuditRow[],
    lowAdpHighDollars: [] as AuditRow[],
    missingAdpHighDollars: [] as AuditRow[],
    highModelMissingAdp: [] as AuditRow[],
    rankGap50: [] as AuditRow[],
    valueGap10: [] as AuditRow[],
  };

  for (const r of auditRows) {
    if (
      r.market_adp_rank != null &&
      r.market_adp_rank <= 50 &&
      r.auction_value != null &&
      r.auction_value <= 15
    ) {
      flags.highAdpLowDollars.push(r);
    }
    if (
      r.market_adp_rank != null &&
      r.market_adp_rank >= 80 &&
      r.auction_value != null &&
      r.auction_value >= 28
    ) {
      flags.lowAdpHighDollars.push(r);
    }
    if (r.market_adp == null && r.auction_value != null && r.auction_value >= 25) {
      flags.missingAdpHighDollars.push(r);
    }
    if (
      r.auction_rank != null &&
      r.auction_rank <= 40 &&
      r.market_adp == null
    ) {
      flags.highModelMissingAdp.push(r);
    }
    if (
      r.rank_delta != null &&
      Math.abs(r.rank_delta) >= 50 &&
      r.market_adp != null
    ) {
      flags.rankGap50.push(r);
    }
    if (
      r.value_delta != null &&
      Math.abs(r.value_delta) >= 10 &&
      r.market_adp != null
    ) {
      flags.valueGap10.push(r);
    }
  }

  const sortAbs = <K extends keyof AuditRow>(arr: AuditRow[], key: K) =>
    [...arr].sort(
      (a, b) => Math.abs(num(b[key]) ?? 0) - Math.abs(num(a[key]) ?? 0),
    );

  sortAbs(flags.highAdpLowDollars, "market_adp_rank");
  sortAbs(flags.lowAdpHighDollars, "auction_value");
  sortAbs(flags.valueGap10, "value_delta");
  sortAbs(flags.rankGap50, "rank_delta");

  const bucketStats: Record<
    string,
    { count: number; avg: number; min: number; max: number; n_adp: number }
  > = {};
  for (const b of [
    "1-12",
    "13-24",
    "25-50",
    "51-75",
    "76-100",
    "101-150",
    "151-250",
    "251+",
  ]) {
    const vals = auditRows
      .filter((r) => r.bucket === b && r.auction_value != null)
      .map((r) => r.auction_value!);
    if (vals.length === 0) continue;
    bucketStats[b] = {
      count: vals.length,
      avg: vals.reduce((a, c) => a + c, 0) / vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
      n_adp: auditRows.filter((r) => r.bucket === b).length,
    };
  }

  const deepDives = auditRows.filter((r) =>
    DEEP_DIVE_NAMES.some(
      (n) => r.name.toLowerCase().replace(/\./g, "") === n.toLowerCase().replace(/\./g, ""),
    ),
  );

  const report = {
    league: { id: leagueId, name: league.name },
    engine_meta: {
      inflation_factor: resp.inflation_factor,
      inflation_model: resp.inflation_model,
      remaining_slots: resp.remaining_slots,
      draftable_pool_size: resp.draftable_pool_size,
      auction_curve_reason: resp.auction_curve_reason,
      market_pressure: (resp.valuation_context as Record<string, unknown>)
        ?.context_v2
        ? (resp.valuation_context as Record<string, unknown>).context_v2
        : resp.context_v2,
    },
    counts: {
      valuation_rows: valuations.length,
      player_ids: playerIds.length,
      with_market_adp: withAdp.length,
      keepers: keeperIds.size,
      auction_drafted: draftedIds.size,
    },
    bucket_medians: Object.fromEntries(bucketMedians),
    bucket_stats: bucketStats,
    flags_top25: {
      high_adp_low_dollars: flags.highAdpLowDollars.slice(0, 25),
      low_adp_high_dollars: flags.lowAdpHighDollars.slice(0, 25),
      missing_adp_high_dollars: flags.missingAdpHighDollars.slice(0, 25),
      rank_gap_50: flags.rankGap50.slice(0, 25),
      value_gap_10: flags.valueGap10.slice(0, 25),
    },
    deep_dives: deepDives,
    rows: auditRows,
  };

  if (outJson) {
    const abs = path.resolve(outJson);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(report, null, 2));
    console.log("Wrote", abs);
  }

  console.log("\n=== ADP vs auction_value audit ===");
  console.log("League:", league.name, leagueId);
  console.log("Counts:", report.counts);
  console.log("Engine:", {
    inflation_factor: report.engine_meta.inflation_factor,
    remaining_slots: report.engine_meta.remaining_slots,
    draftable_pool_size: report.engine_meta.draftable_pool_size,
  });
  console.log("\nBucket medians (ADP rank → median auction $):");
  console.table(report.bucket_medians);
  console.log("\nTop high ADP / low $:");
  console.table(
    flags.highAdpLowDollars.slice(0, 15).map((r) => ({
      name: r.name,
      adp: r.market_adp,
      adp_rk: r.market_adp_rank,
      auc_rk: r.auction_rank,
      $: r.auction_value,
      base: r.baseline_value,
      surplus: r.surplus_basis,
      repl: r.replacement_key_used,
      keeper: r.keeper,
    })),
  );
  console.log("\nTop low ADP / high $:");
  console.table(
    flags.lowAdpHighDollars.slice(0, 15).map((r) => ({
      name: r.name,
      adp: r.market_adp,
      adp_rk: r.market_adp_rank,
      auc_rk: r.auction_rank,
      $: r.auction_value,
      base: r.baseline_value,
      surplus: r.surplus_basis,
      repl: r.replacement_key_used,
    })),
  );
  console.log("\nDeep dives:");
  console.table(
    deepDives.map((r) => ({
      name: r.name,
      adp: r.market_adp,
      adp_rk: r.market_adp_rank,
      auc_rk: r.auction_rank,
      $: r.auction_value,
      base: r.baseline_value,
      surplus: r.surplus_basis,
      keeper: r.keeper,
      drafted: r.drafted,
    })),
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
