/**
 * End-to-end deployed valuation verification (BFF path → Engine).
 * Uses MONGO_URI + AMETHYST_API_URL from env (production Engine when unset override).
 *
 *   cd apps/api && pnpm exec tsx scripts/verify-deployed-valuation-suite.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import League from "../src/models/League";
import RosterEntry from "../src/models/RosterEntry";
import {
  buildValuationContext,
  finalizeEngineValuationPostPayload,
  valuationIncomingToEngineContext,
} from "../src/lib/engineContext";
import { resolveAuctionCurveModelForDraftRequest } from "../src/lib/auctionCurveModel";
import { amethyst, resolveAmethystEngineBaseUrl } from "../src/lib/amethyst";
import { readCheckpointFixtureJson } from "../src/lib/engineCheckpointCatalog";
import { valuationIncomingSchema } from "../src/validation/schemas";
import type { EngineCheckpointId } from "../src/lib/engineCheckpointCatalog";
function displayTier(av: number): number {
  if (!Number.isFinite(av) || av < 1) return 5;
  if (av >= 25) return 1;
  if (av >= 15) return 2;
  if (av >= 10) return 3;
  if (av >= 5) return 4;
  return 5;
}

const TRACKED = [
  "Shohei Ohtani",
  "Tarik Skubal",
  "Aaron Judge",
  "Juan Soto",
  "Julio Rodríguez",
  "Bobby Witt Jr.",
  "José Ramírez",
  "Vladimir Guerrero Jr.",
  "Cal Raleigh",
  "Bryan Woo",
  "Joe Ryan",
  "David Bednar",
  "Garrett Crochet",
  "Hunter Brown",
  "Mason Miller",
  "Fernando Tatis Jr.",
];

function normName(n: string): string {
  return n
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function tierCounts(
  rows: Array<{ auction_value?: number }>,
  draftable: Set<string>,
  ids: Map<string, string>,
) {
  const c = { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };
  for (const r of rows) {
    const pid = ids.get(normName(String(r.name ?? "")));
    if (!pid || !draftable.has(pid)) continue;
    const av = r.auction_value;
    if (typeof av !== "number") continue;
    const t = displayTier(av);
    c[`T${t}` as keyof typeof c]++;
  }
  return c;
}

async function postEngine(payload: Record<string, unknown>) {
  const { data } = await amethyst.post("/valuation/calculate", payload);
  return data as Record<string, unknown>;
}

async function leagueValuation(leagueId: string) {
  const league = await League.findById(leagueId).lean();
  if (!league) throw new Error(`league ${leagueId}`);
  const entries = await RosterEntry.find({ leagueId: league._id }).lean();
  const ctx = await buildValuationContext(
    league as Parameters<typeof buildValuationContext>[0],
    entries as Parameters<typeof buildValuationContext>[1],
    {
      userTeamId: "team_1",
      auctionCurveModel: resolveAuctionCurveModelForDraftRequest({}),
    },
  );
  const payload = finalizeEngineValuationPostPayload(ctx) as Record<
    string,
    unknown
  >;
  const resp = await postEngine(payload);
  return { league, payload, resp };
}

async function checkpointValuation(key: EngineCheckpointId) {
  const cp = readCheckpointFixtureJson(key);
  const parsed = valuationIncomingSchema.parse(cp);
  const ctx = valuationIncomingToEngineContext(parsed);
  const payload = finalizeEngineValuationPostPayload({
    ...ctx,
    user_team_id: "team_1",
    auction_curve_model: resolveAuctionCurveModelForDraftRequest({}),
    deterministic: true,
    seed: 42,
  }) as Record<string, unknown>;
  const resp = await postEngine(payload);
  return { payload, resp };
}

function summarize(
  label: string,
  payload: Record<string, unknown>,
  resp: Record<string, unknown>,
) {
  const vals = (resp.valuations ?? []) as Array<{
    name?: string;
    player_id?: string;
    auction_value?: number;
  }>;
  const draftable = new Set(
    ((resp.draftable_player_ids as string[]) ?? []).map(String),
  );
  const idByNorm = new Map(
    vals.map((v) => [normName(String(v.name ?? "")), String(v.player_id)]),
  );
  const sorted = vals
    .filter((v) => v.player_id && draftable.has(String(v.player_id)))
    .sort((a, b) => (b.auction_value ?? 0) - (a.auction_value ?? 0));
  const tracked: Record<string, number | string> = {};
  for (const n of TRACKED) {
    const pid = idByNorm.get(normName(n));
    const row = vals.find((v) => String(v.player_id) === pid);
    tracked[n] =
      row && draftable.has(String(row.player_id))
        ? Math.round((row.auction_value ?? 0) * 100) / 100
        : row
          ? "keeper/non-draftable"
          : "missing";
  }
  return {
    label,
    engine: resolveAmethystEngineBaseUrl(),
    opening_board_calibration: payload.opening_board_calibration ?? null,
    pre_draft_sections: Array.isArray(payload.pre_draft_rosters)
      ? payload.pre_draft_rosters.length
      : 0,
    player_ids: Array.isArray(payload.player_ids) ? payload.player_ids.length : 0,
    pool: draftable.size,
    remaining_slots: resp.remaining_slots,
    inflation_factor: resp.inflation_factor,
    auction_curve_reason: resp.auction_curve_reason,
    max_auction: sorted[0]?.auction_value,
    top1: sorted[0]?.name,
    tier_counts: tierCounts(vals, draftable, idByNorm),
    tracked,
  };
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI required");
  await mongoose.connect(uri);

  const original = await League.findOne({ name: /^original$/i }).lean();
  const friendly = await League.findOne({
    name: "Friendly League",
    _id: { $ne: original?._id },
  }).lean();
  const demoPre = await League.findOne({ name: /\[Demo\].*pre\s*draft/i }).lean();

  const out: Record<string, unknown> = {
    engine: resolveAmethystEngineBaseUrl(),
    at: new Date().toISOString(),
  };

  if (original) {
    const { payload, resp } = await leagueValuation(String(original._id));
    out.A_original = summarize("Original", payload, resp);
  }
  if (friendly) {
    const { payload, resp } = await leagueValuation(String(friendly._id));
    out.B_friendly_empty = summarize("Friendly empty", payload, resp);
  }
  if (demoPre) {
    const { payload, resp } = await leagueValuation(String(demoPre._id));
    out.C_demo_pre_draft = summarize("[Demo] pre draft", payload, resp);
  }

  const checkpoints: EngineCheckpointId[] = [
    "pre_draft",
    "after_pick_10",
    "after_pick_50",
    "after_pick_100",
    "after_pick_130",
  ];
  out.E_checkpoints = {};
  for (const ck of checkpoints) {
    const { payload, resp } = await checkpointValuation(ck);
    (out.E_checkpoints as Record<string, unknown>)[ck] = summarize(
      ck,
      payload,
      resp,
    );
  }

  console.log(JSON.stringify(out, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
