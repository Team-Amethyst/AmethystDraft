/**
 * Production smoke: Demo leagues in Mongo → Draft BFF payload → live Engine.
 * Compares Research path (buildValuationContext) to direct Engine + checkpoint audit.
 *
 *   cd apps/api && pnpm exec tsx scripts/draftroom-production-smoke.ts
 */
import "dotenv/config";
import { config } from "dotenv";
import path from "path";
import mongoose from "mongoose";
import League from "../src/models/League";
import RosterEntry from "../src/models/RosterEntry";
import {
  buildValuationContext,
  finalizeEngineValuationPostPayload,
} from "../src/lib/engineContext";
import { resolveAuctionCurveModelForDraftRequest } from "../src/lib/auctionCurveModel";
import { amethyst } from "../src/lib/amethyst";
import {
  readCheckpointFixtureJson,
  type EngineCheckpointId,
} from "../src/lib/engineCheckpointCatalog";
import { shapeValuationResponseForDraft } from "../src/lib/draftValuationContract";

config({ path: path.resolve(__dirname, "../../../AmethystAPI/.env") });

const CHECKPOINTS: { key: EngineCheckpointId; namePattern: RegExp }[] = [
  { key: "pre_draft", namePattern: /\[Demo\]\s*pre\s*draft/i },
  {
    key: "after_pick_10",
    namePattern: /\[Demo\]\s*after\s*pick\s*10(?:\s|$)/i,
  },
  {
    key: "after_pick_50",
    namePattern: /\[Demo\]\s*after[\s_]*pick[\s_]*50/i,
  },
  {
    key: "after_pick_100",
    namePattern: /\[Demo\]\s*after[\s_]*pick[\s_]*100/i,
  },
  {
    key: "after_pick_130",
    namePattern: /\[Demo\]\s*after[\s_]*pick[\s_]*130/i,
  },
  {
    key: "finished_league",
    namePattern: /\[Demo\]\s*finished/i,
  },
];

const JUDGE_ID = "592450";

function curveMetrics(vals: { auction_value: number }[]) {
  const avs = [...vals]
    .map((v) => v.auction_value)
    .sort((a, b) => b - a)
    .slice(0, 75);
  let maxDrop = 0;
  for (let i = 1; i < avs.length; i++) {
    maxDrop = Math.max(maxDrop, avs[i - 1]! - avs[i]!);
  }
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
  return {
    top1: avs[0] ?? 0,
    top10Avg: avg(avs.slice(0, 10)),
    maxAdjDrop: maxDrop,
    count48: avs.filter((v) => Math.round(v) === 48).length,
  };
}

function ranks34to40(vals: Array<{ name?: string; auction_value: number }>) {
  const sorted = [...vals].sort((a, b) => b.auction_value - a.auction_value);
  return sorted.slice(33, 40).map((v, i) => ({
    rank: 34 + i,
    raw: v.auction_value,
    ui: Math.round(v.auction_value),
    name: v.name,
  }));
}

async function postEngine(payload: Record<string, unknown>) {
  const { data } = await amethyst.post("/valuation/calculate", payload);
  return data as Record<string, unknown>;
}

async function valuationForLeague(leagueId: string) {
  const league = await League.findById(leagueId).lean();
  if (!league) throw new Error(`league ${leagueId} missing`);
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
  const raw = await postEngine({
    ...payload,
    deterministic: true,
    seed: 42,
    explain_valuation_rows: true,
  });
  const shaped = shapeValuationResponseForDraft(raw, {});
  return { league, payload, raw, shaped };
}

async function checkpointEngine(key: EngineCheckpointId) {
  const cp = readCheckpointFixtureJson(key);
  const { valuationIncomingToEngineContext } = await import(
    "../src/lib/engineContext"
  );
  const { valuationIncomingSchema } = await import("../src/validation/schemas");
  const parsed = valuationIncomingSchema.parse(cp);
  const ctx = valuationIncomingToEngineContext(parsed);
  const payload = finalizeEngineValuationPostPayload({
    ...ctx,
    user_team_id: "team_1",
    auction_curve_model: resolveAuctionCurveModelForDraftRequest({}),
    deterministic: true,
    seed: 42,
    explain_valuation_rows: true,
  }) as Record<string, unknown>;
  return postEngine(payload);
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI required");

  const draftHealth = await fetch(
    `${(process.env.DRAFT_API_URL ?? "https://at5ms22dhj.us-east-1.awsapprunner.com").replace(/\/$/, "")}/api/health`,
  ).then((r) => r.json());
  const engineHealth = await fetch(
    "https://q6dbuvmuvh.us-east-1.awsapprunner.com/api/health",
  ).then((r) => r.json());

  console.log("=== Deployed versions ===");
  console.log("Draft API health:", draftHealth);
  console.log("Engine health:", engineHealth);

  await mongoose.connect(uri);

  const report: Record<string, unknown> = {};

  for (const { key, namePattern } of CHECKPOINTS) {
    const league = await League.findOne({ name: namePattern })
      .sort({ updatedAt: -1 })
      .lean();
    if (!league) {
      report[key] = { status: "missing_demo_league" };
      console.log(`\n[${key}] no demo league matching ${namePattern}`);
      continue;
    }

    const { shaped, raw } = await valuationForLeague(league._id!.toString());
    const vals = (shaped.valuations ?? []) as Array<{
      player_id?: string;
      name?: string;
      auction_value: number;
    }>;
    const m = curveMetrics(vals);
    const judge = vals.find((v) => String(v.player_id) === JUDGE_ID);
    const cpRaw = await checkpointEngine(key);
    const cpVals = (cpRaw.valuations ?? []) as Array<{
      auction_value: number;
    }>;
    const cpM = curveMetrics(cpVals);
    const top1Delta = Math.abs(m.top1 - cpM.top1);

    report[key] = {
      league: { id: league._id?.toString(), name: league.name },
      research_path: m,
      checkpoint_fixture: cpM,
      top1_delta_research_vs_checkpoint: top1Delta,
      ranks_34_40: ranks34to40(vals),
      judge_auction_value: judge?.auction_value,
      internal_mode: raw.internal_allocation_mode,
      smoothing: raw.curve_guardrails_applied,
      budget_team1: (shaped as { budget_by_team?: Record<string, number> })
        .budget_by_team?.team_1,
    };

    console.log(`\n=== ${key} (${league.name}) ===`);
    console.log(JSON.stringify(report[key], null, 2));
  }

  await mongoose.disconnect();
  console.log("\n=== Summary ===");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
