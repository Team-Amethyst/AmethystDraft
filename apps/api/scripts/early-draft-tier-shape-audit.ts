/**
 * Early-draft board shape + T1–T5 value-band fill audit (aligned Research/CC path).
 *
 *   cd apps/api && pnpm exec tsx scripts/early-draft-tier-shape-audit.ts
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import League from "../src/models/League";
import RosterEntry from "../src/models/RosterEntry";
import { amethyst } from "../src/lib/amethyst";
import {
  buildEngineValuationCalculateBodyFromFixture,
  buildValuationContext,
  finalizeEngineValuationPostPayload,
} from "../src/lib/engineContext";
import { resolveAuctionCurveModelForDraftRequest } from "../src/lib/auctionCurveModel";
import {
  readCheckpointFixtureJson,
  type EngineCheckpointId,
} from "../src/lib/engineCheckpointCatalog";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "../../tmp/early-draft-tier-shape-audit.json");

type ValRow = {
  player_id?: string;
  name?: string;
  position?: string;
  auction_value?: number;
  auction_rank?: number;
  auction_tier?: number;
  valuation_explain?: {
    replacement_key_used?: string;
    surplus_basis?: number;
  };
};

type EngineResp = {
  valuations?: ValRow[];
  draftable_player_ids?: string[];
  inflation_factor?: number;
  replacement_values_by_slot_or_position?: Record<string, number>;
};

type DisplayTier = 1 | 2 | 3 | 4 | 5;

function displayTierForRaw(raw: number): DisplayTier {
  if (!Number.isFinite(raw) || raw < 1) return 5;
  if (raw >= 25) return 1;
  if (raw >= 15) return 2;
  if (raw >= 10) return 3;
  if (raw >= 5) return 4;
  return 5;
}

function displayDollar(n: number): string {
  const r = Math.round(n);
  return `${r < 0 ? "-" : ""}$${Math.abs(r)}`;
}

function normName(n: string): string {
  return n
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const TRACKED = [
  "Aaron Judge",
  "Julio Rodríguez",
  "Bobby Witt Jr.",
  "José Ramírez",
  "Vladimir Guerrero Jr.",
  "Gunnar Henderson",
  "Cal Raleigh",
  "Anthony Volpe",
  "Tarik Skubal",
  "Bryan Woo",
  "Joe Ryan",
  "David Bednar",
  "Garrett Crochet",
  "Drew Rasmussen",
  "Mason Miller",
  "Camilo Doval",
  "Will Warren",
  "Spencer Jones",
];

async function postFixture(cp: EngineCheckpointId): Promise<EngineResp> {
  const fixture = readCheckpointFixtureJson(cp);
  const body = finalizeEngineValuationPostPayload(
    buildEngineValuationCalculateBodyFromFixture(fixture),
  );
  const { data } = await amethyst.post("/valuation/calculate", body);
  return data as EngineResp;
}

async function postMongoDemo(): Promise<{
  resp: EngineResp;
  payload: Record<string, unknown>;
  leagueName: string;
}> {
  const demoLeagues = await League.find({
    name: /\[Demo\].*pre\s*draft/i,
  })
    .sort({ updatedAt: -1 })
    .limit(1)
    .lean();
  const league = demoLeagues[0];
  if (!league) throw new Error("No [Demo] pre draft league in Mongo");

  const entries = await RosterEntry.find({ leagueId: league._id }).lean();
  const context = await buildValuationContext(
    league as Parameters<typeof buildValuationContext>[0],
    entries as Parameters<typeof buildValuationContext>[1],
    {
      userTeamId: "team_1",
      auctionCurveModel: resolveAuctionCurveModelForDraftRequest({}),
    },
  );
  const payload = finalizeEngineValuationPostPayload(context) as Record<
    string,
    unknown
  >;
  const { data } = await amethyst.post("/valuation/calculate", payload);
  return {
    resp: data as EngineResp,
    payload,
    leagueName: String(league.name ?? league._id),
  };
}

function draftableRows(resp: EngineResp): ValRow[] {
  const ids = new Set(resp.draftable_player_ids ?? []);
  return (resp.valuations ?? []).filter(
    (v) => v.player_id && ids.has(v.player_id),
  );
}

function sortedByAuction(rows: ValRow[]): ValRow[] {
  return [...rows].sort(
    (a, b) => (b.auction_value ?? 0) - (a.auction_value ?? 0),
  );
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function countAbove(rows: ValRow[], floor: number): number {
  return rows.filter((r) => (r.auction_value ?? 0) >= floor).length;
}

function largestAdjacentDrop(rows: ValRow[], n: number): number {
  const top = sortedByAuction(rows).slice(0, n);
  let maxDrop = 0;
  for (let i = 0; i < top.length - 1; i++) {
    const a = top[i]!.auction_value ?? 0;
    const b = top[i + 1]!.auction_value ?? 0;
    maxDrop = Math.max(maxDrop, a - b);
  }
  return maxDrop;
}

function roundedShelfCount(rows: ValRow[]): number {
  const shelves = new Map<number, number>();
  for (const r of rows) {
    const raw = r.auction_value;
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const whole = Math.round(raw);
    shelves.set(whole, (shelves.get(whole) ?? 0) + 1);
  }
  return [...shelves.values()].filter((c) => c >= 3).length;
}

function plateau48(rows: ValRow[]): number {
  return rows.filter(
    (r) =>
      typeof r.auction_value === "number" &&
      r.auction_value >= 47.5 &&
      r.auction_value <= 48.5,
  ).length;
}

function boardShape(label: string, resp: EngineResp, payload?: Record<string, unknown>) {
  const rows = draftableRows(resp);
  const avs = rows
    .map((r) => r.auction_value)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const sorted = sortedByAuction(rows);
  const top5 = sorted.slice(0, 5).map((r) => r.auction_value ?? 0);
  const top10 = sorted.slice(0, 10).map((r) => r.auction_value ?? 0);
  const top25 = sorted.slice(0, 25).map((r) => r.auction_value ?? 0);

  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;

  return {
    label,
    payload_player_ids: Array.isArray(payload?.player_ids)
      ? (payload.player_ids as unknown[]).length
      : 0,
    payload_position_overrides: Array.isArray(payload?.position_overrides)
      ? (payload.position_overrides as unknown[]).length
      : 0,
    draftable_pool: resp.draftable_player_ids?.length ?? 0,
    inflation_factor: resp.inflation_factor,
    UTIL_replacement: resp.replacement_values_by_slot_or_position?.UTIL,
    max_auction: sorted[0]?.auction_value ?? 0,
    top5_avg: avg(top5),
    top10_avg: avg(top10),
    top25_avg: avg(top25),
    median_auction: median(avs),
    above_30: countAbove(rows, 30),
    above_25: countAbove(rows, 25),
    above_20: countAbove(rows, 20),
    above_15: countAbove(rows, 15),
    above_10: countAbove(rows, 10),
    above_5: countAbove(rows, 5),
    above_1: countAbove(rows, 1),
    largest_drop_top25: largestAdjacentDrop(rows, 25),
    largest_drop_top75: largestAdjacentDrop(rows, 75),
    repeated_rounded_shelves_gte3: roundedShelfCount(rows),
    plateau_48_count: plateau48(rows),
    top1_name: sorted[0]?.name,
    top1_value: sorted[0]?.auction_value,
  };
}

function tierFill(rows: ValRow[]) {
  const byTier = new Map<DisplayTier, ValRow[]>();
  for (const t of [1, 2, 3, 4, 5] as DisplayTier[]) byTier.set(t, []);

  for (const r of rows) {
    const raw = r.auction_value;
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const t = displayTierForRaw(raw);
    byTier.get(t)!.push(r);
  }

  const summarize = (tier: DisplayTier) => {
    const list = sortedByAuction(byTier.get(tier) ?? []);
    const avs = list.map((r) => r.auction_value ?? 0);
    const pos: Record<string, number> = {};
    for (const r of list) {
      const p = (r.valuation_explain?.replacement_key_used ?? r.position ?? "?").toUpperCase();
      pos[p] = (pos[p] ?? 0) + 1;
    }
    return {
      tier,
      band:
        tier === 1
          ? "$25+"
          : tier === 2
            ? "$15–24"
            : tier === 3
              ? "$10–14"
              : tier === 4
                ? "$5–9"
                : "$1–4",
      available_count: list.length,
      raw_min: avs.length ? Math.min(...avs) : null,
      raw_median: median(avs),
      raw_max: avs.length ? Math.max(...avs) : null,
      raw_avg: avs.length ? avs.reduce((s, x) => s + x, 0) / avs.length : null,
      position_mix: pos,
      top15: list.slice(0, 15).map((r) => ({
        name: r.name,
        raw: r.auction_value,
        shown: displayDollar(r.auction_value ?? 0),
        rank: r.auction_rank,
      })),
      bottom10: list.slice(-10).map((r) => ({
        name: r.name,
        raw: r.auction_value,
        shown: displayDollar(r.auction_value ?? 0),
        rank: r.auction_rank,
      })),
      status:
        list.length === 0
          ? "empty"
          : tier === 5
            ? "min-bid-reserve"
            : "active",
    };
  };

  return ([1, 2, 3, 4, 5] as DisplayTier[]).map(summarize);
}

function trackedTable(resp: EngineResp) {
  const ids = new Set(resp.draftable_player_ids ?? []);
  const vals = resp.valuations ?? [];
  return TRACKED.map((name) => {
    const v = vals.find((x) => normName(x.name ?? "") === normName(name));
    if (!v) {
      return { name, valuation_row: false, why: "no row in valuations[]" };
    }
    const raw = v.auction_value;
    const hasRaw = typeof raw === "number" && Number.isFinite(raw);
    return {
      name: v.name,
      auction_value_raw: hasRaw ? raw : null,
      displayed_dollar: hasRaw ? displayDollar(raw) : "—",
      auction_rank: v.auction_rank ?? null,
      user_facing_tier: hasRaw ? `T${displayTierForRaw(raw)}` : "—",
      engine_auction_tier: v.auction_tier ?? null,
      draftable_pool: v.player_id ? ids.has(v.player_id) : false,
      slot: v.valuation_explain?.replacement_key_used ?? v.position,
      why:
        !hasRaw
          ? "no finite auction_value"
          : !ids.has(v.player_id!)
            ? "outside draftable pool"
            : undefined,
    };
  });
}

function flags(shape: ReturnType<typeof boardShape>, tiers: ReturnType<typeof tierFill>) {
  const issues: string[] = [];
  if (shape.max_auction < 25) {
    issues.push(`max auction ${shape.max_auction} < $25 in pre-draft`);
  }
  const t1 = tiers.find((t) => t.tier === 1);
  if (t1 && t1.available_count < 5) {
    issues.push(`T1 only ${t1.available_count} players (expected meaningful elite group)`);
  }
  if (t1 && t1.available_count === 0) {
    issues.push("T1 empty");
  }
  const t2 = tiers.find((t) => t.tier === 2);
  const t3 = tiers.find((t) => t.tier === 3);
  if (t2 && t2.available_count < 10) issues.push(`T2 thin: ${t2.available_count}`);
  if (t3 && t3.available_count < 15) issues.push(`T3 thin: ${t3.available_count}`);
  if (shape.top1_name && normName(shape.top1_name).includes("woo")) {
    issues.push("Bryan Woo is #1 — catalog envelope regression?");
  }
  if (shape.plateau_48_count > 0) {
    issues.push(`$48 plateau: ${shape.plateau_48_count}`);
  }
  if (shape.repeated_rounded_shelves_gte3 > 12) {
    issues.push(`many flat shelves: ${shape.repeated_rounded_shelves_gte3}`);
  }
  return issues;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI required");

  await mongoose.connect(uri);

  const mongo = await postMongoDemo();
  const preCp = await postFixture("pre_draft");
  const ap10 = await postFixture("after_pick_10");
  const ap50 = await postFixture("after_pick_50");

  const preRows = draftableRows(preCp);
  const preTiers = tierFill(preRows);
  const mongoShape = boardShape("mongo_demo_research_cc", mongo.resp, mongo.payload);
  const preShape = boardShape("checkpoint_pre_draft", preCp);
  const ap10Shape = boardShape("checkpoint_after_pick_10", ap10);
  const ap50Shape = boardShape("checkpoint_after_pick_50", ap50);

  const preIssues = flags(preShape, preTiers);

  const report = {
    generated_at: new Date().toISOString(),
    engine_url: process.env.AMETHYST_API_URL,
    mongo_league: mongo.leagueName,
    board_shape: [mongoShape, preShape, ap10Shape, ap50Shape],
    tier_fill_pre_draft: preTiers,
    tracked_pre_draft: trackedTable(preCp),
    tracked_mongo_demo: trackedTable(mongo.resp),
    mongo_vs_checkpoint_pre: {
      pool_delta:
        (mongoShape.draftable_pool ?? 0) - (preShape.draftable_pool ?? 0),
      inflation_delta:
        (mongoShape.inflation_factor ?? 0) - (preShape.inflation_factor ?? 0),
      max_auction_delta:
        (mongoShape.max_auction ?? 0) - (preShape.max_auction ?? 0),
      top1_match:
        normName(mongoShape.top1_name ?? "") === normName(preShape.top1_name ?? ""),
    },
    flags: preIssues,
    verdict:
      preIssues.some((i) => i.includes("Woo") || i.includes("envelope"))
        ? "path_mismatched"
        : preIssues.length === 0
          ? "early_draft_tiers_healthy"
          : preIssues.some((i) => i.includes("flat") || i.includes("T1"))
            ? "display_or_shape_followup"
            : "minor_flags",
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await mongoose.disconnect();
  if (preIssues.some((i) => i.includes("Woo") || i.includes("envelope"))) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
