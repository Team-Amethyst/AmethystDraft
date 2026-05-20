/**
 * Exact Friendly-league collapse scenario: user team with expensive keepers,
 * Aaron Judge must remain available with bounded auction value.
 *
 *   cd apps/api && pnpm exec tsx scripts/friendly-judge-collapse-audit.ts
 *   AMETHYST_API_BASE_URL=http://localhost:3099 pnpm exec tsx scripts/friendly-judge-collapse-audit.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import {
  finalizeEngineValuationPostPayload,
  valuationIncomingToEngineContext,
} from "../src/lib/engineContext";
import { resolveAuctionCurveModelForDraftRequest } from "../src/lib/auctionCurveModel";
import { amethyst, resolveAmethystEngineBaseUrl } from "../src/lib/amethyst";
import { readCheckpointFixtureJson } from "../src/lib/engineCheckpointCatalog";
import { valuationIncomingSchema } from "../src/validation/schemas";
import {
  resolveFriendlyLeagueForAudit,
  CANONICAL_FRIENDLY_LEAGUE_ID,
} from "../src/lib/canonicalAuditLeagues";
import type { ILeague } from "../models/League";

const JUDGE_ID = "592450";
const EXPENSIVE_KEEPERS = [
  { player_id: "596019", name: "Francisco Lindor", position: "SS", paid: 88 },
  { player_id: "643377", name: "Garrett Crochet", position: "P", paid: 71 },
  { player_id: "607208", name: "Trey Turner", position: "SS", paid: 83 },
  { player_id: "543807", name: "George Springer", position: "OF", paid: 20 },
];

const OF_ELITES = [
  "Aaron Judge",
  "Juan Soto",
  "Julio Rodríguez",
  "Fernando Tatis Jr.",
  "Jarren Duran",
];

function normName(n: string): string {
  return n
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function roundBid(n: number, maxExecutable?: number): number {
  let x = Math.max(0, Math.round(n * 2) / 2);
  if (maxExecutable != null && Number.isFinite(maxExecutable)) {
    x = Math.min(x, maxExecutable);
  }
  return x;
}

async function postCalculate(payload: Record<string, unknown>) {
  const { data } = await amethyst.post("/valuation/calculate", payload);
  return data as Record<string, unknown>;
}

async function postPlayer(
  payload: Record<string, unknown>,
  playerId: string,
) {
  const { data } = await amethyst.post("/valuation/player", {
    ...payload,
    player_id: playerId,
    explain_valuation_rows: true,
  });
  return data as Record<string, unknown>;
}

function rosterSlotsForLeague(league: ILeague): { position: string; count: number }[] {
  const raw = league.rosterSlots;
  if (Array.isArray(raw)) {
    return raw.map((r) => ({
      position: String((r as { position: string }).position),
      count: Number((r as { count: number }).count),
    }));
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, number>).map(([position, count]) => ({
      position,
      count: Number(count),
    }));
  }
  return [
    { position: "C", count: 1 },
    { position: "1B", count: 1 },
    { position: "2B", count: 1 },
    { position: "3B", count: 1 },
    { position: "SS", count: 1 },
    { position: "OF", count: 3 },
    { position: "MI", count: 1 },
    { position: "CI", count: 1 },
    { position: "UTIL", count: 1 },
    { position: "SP", count: 5 },
    { position: "RP", count: 2 },
    { position: "BN", count: 3 },
  ];
}

/** Full keeper board (OF replacement inflated) + user expensive quartet on team_a. */
function buildPreDraftUserExpensivePayload(userTeamId: string) {
  const cp = readCheckpointFixtureJson("pre_draft") as {
    pre_draft_rosters?: Array<{
      team_id: string;
      players: Array<Record<string, unknown>>;
    }>;
  };
  const teamA = cp.pre_draft_rosters?.find((t) => t.team_id === "team_a");
  if (teamA) {
    for (const k of EXPENSIVE_KEEPERS) {
      if (!teamA.players.some((p) => String(p.player_id) === k.player_id)) {
        teamA.players.push({
          player_id: k.player_id,
          name: k.name,
          position: k.position,
          team: "UNK",
          team_id: "team_a",
          paid: k.paid,
          is_keeper: true,
        });
      }
    }
  }
  const parsed = valuationIncomingSchema.parse(cp);
  const ctx = valuationIncomingToEngineContext(parsed);
  return finalizeEngineValuationPostPayload({
    ...ctx,
    user_team_id: userTeamId,
    auction_curve_model: resolveAuctionCurveModelForDraftRequest({}),
    deterministic: true,
    seed: 42,
    checkpoint: "friendly_collapse_audit",
  }) as Record<string, unknown>;
}

/** Friendly 12-team empty league + only user quartet (sparse keepers). */
function buildSparseFriendlyPayload(league: ILeague, userTeamId: string) {
  const cp = readCheckpointFixtureJson("pre_draft");
  const ctx = valuationIncomingToEngineContext(
    valuationIncomingSchema.parse(cp),
  );
  const numTeams = league.numTeams ?? 12;
  const totalBudget = league.budget ?? 260;
  const keeperSpend = EXPENSIVE_KEEPERS.reduce((s, k) => s + k.paid, 0);
  const budget_by_team_id: Record<string, number> = {};
  for (let i = 1; i <= numTeams; i++) {
    const tid = `team_${i}`;
    budget_by_team_id[tid] =
      tid === userTeamId ? Math.max(0, totalBudget - keeperSpend) : totalBudget;
  }
  return finalizeEngineValuationPostPayload({
    roster_slots: rosterSlotsForLeague(league),
    scoring_categories: ctx.scoring_categories,
    total_budget: totalBudget,
    num_teams: numTeams,
    league_scope: (league.leagueScope as "Mixed") ?? ctx.league_scope,
    drafted_players: [],
    schema_version: "1.0.0",
    checkpoint: "friendly_sparse_keepers",
    budget_by_team_id,
    scoring_format: ctx.scoring_format,
    pre_draft_rosters: [
      {
        team_id: userTeamId,
        players: EXPENSIVE_KEEPERS.map((k) => ({
          player_id: k.player_id,
          name: k.name,
          position: k.position,
          team: "UNK",
          team_id: userTeamId,
          paid: k.paid,
          is_keeper: true,
        })),
      },
    ],
    user_team_id: userTeamId,
    auction_curve_model: resolveAuctionCurveModelForDraftRequest({}),
    deterministic: true,
    seed: 42,
  }) as Record<string, unknown>;
}

async function runScenario(
  label: string,
  payload: Record<string, unknown>,
  userTeamId: string,
) {
  const board = await postCalculate(payload);
  if (!board?.valuations) {
    console.error("Engine error:", JSON.stringify(board, null, 2));
    process.exit(1);
  }
  const resp = board;
  const vals = (resp.valuations ?? []) as Array<{
    player_id?: string;
    name?: string;
    auction_value?: number;
    auction_rank?: number;
    baseline_value?: number;
    valuation_explain?: Record<string, unknown>;
  }>;
  const draftable = new Set(
    ((resp.draftable_player_ids as string[]) ?? []).map(String),
  );
  const rosteredIds = new Set<string>();
  for (const d of (payload.drafted_players as { player_id?: string }[]) ?? []) {
    if (d.player_id) rosteredIds.add(d.player_id);
  }
  const preSections = (payload.pre_draft_rosters ?? []) as Array<{
    players?: { player_id?: string }[];
  }>;
  for (const sec of preSections) {
    for (const r of sec.players ?? []) {
      if (r.player_id) rosteredIds.add(r.player_id);
    }
  }

  const judge = vals.find((v) => v.player_id === JUDGE_ID);
  const judgeExplain = judge?.valuation_explain ?? {};
  const replOf =
    judgeExplain.replacement_value_used ??
    judgeExplain.replacement_key_used;

  const playerResp = await postPlayer(payload, JUDGE_ID);
  const playerRow = (
    (playerResp.player as { auction_value?: number }) ??
    (playerResp.valuations as typeof vals)?.[0]
  ) as { auction_value?: number } | undefined;

  const ofElites = vals.filter(
    (v) =>
      v.name &&
      OF_ELITES.some((n) => normName(n) === normName(v.name!)) &&
      draftable.has(String(v.player_id)),
  );

  const allOfAvailable = vals.filter(
    (v) =>
      draftable.has(String(v.player_id)) &&
      (v.valuation_explain?.replacement_key_used === "OF" ||
        String(v.position ?? "").includes("OF")),
  );
  const ofAuctions = allOfAvailable
    .map((v) => v.auction_value ?? 0)
    .filter((n) => n > 5);
  const ofMedian =
    ofAuctions.length > 0
      ? ofAuctions.sort((a, b) => a - b)[Math.floor(ofAuctions.length / 2)]!
      : 0;

  const checks = {
    judge_available_not_rostered:
      draftable.has(JUDGE_ID) &&
      !rosteredIds.has(JUDGE_ID),
    judge_auction_above_min: (judge?.auction_value ?? 0) >= 18,
    judge_auction_below_cap_shelf: (judge?.auction_value ?? 0) < 36,
    judge_not_rank_200: (judge?.auction_rank ?? 999) <= 25,
    judge_cc_research_parity:
      Math.round(judge?.auction_value ?? 0) ===
      Math.round(playerRow?.auction_value ?? -1),
    no_plateau_48: !vals.some(
      (v) =>
        draftable.has(String(v.player_id)) &&
        (v.auction_value ?? 0) >= 47.5 &&
        (v.auction_value ?? 0) <= 48.5,
    ),
    of_elites_not_all_same: new Set(
      ofElites.map((v) => Math.round(v.auction_value ?? 0)),
    ).size >= Math.min(2, ofElites.length),
    of_elites_not_broad_inflated: ofElites.every(
      (v) => (v.auction_value ?? 0) < 40,
    ),
  };

  return {
    scenario: label,
    user_team: userTeamId,
    expensive_keepers: EXPENSIVE_KEEPERS,
    inflation_factor: resp.inflation_factor,
    auction_curve_reason: resp.auction_curve_reason,
    surplus_cash: resp.surplus_cash,
    judge: judge
      ? {
          available: draftable.has(JUDGE_ID),
          auction_value: judge.auction_value,
          auction_rank: judge.auction_rank,
          baseline_value: judge.baseline_value,
          replacement: replOf,
          surplus_basis: judgeExplain.surplus_basis,
          player_endpoint_auction: playerRow?.auction_value,
        }
      : null,
    of_elites: ofElites.map((v) => ({
      name: v.name,
      auction_value: v.auction_value,
      rank: v.auction_rank,
    })),
    of_available_median: ofMedian,
    skubal: vals.find((v) => normName(v.name ?? "") === normName("Tarik Skubal")),
    woo: vals.find((v) => normName(v.name ?? "") === normName("Bryan Woo")),
    tier_counts: (() => {
      const c = { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };
      for (const v of vals) {
        if (!draftable.has(String(v.player_id))) continue;
        const av = v.auction_value ?? 0;
        if (av >= 25) c.T1++;
        else if (av >= 15) c.T2++;
        else if (av >= 10) c.T3++;
        else if (av >= 5) c.T4++;
        else c.T5++;
      }
      return c;
    })(),
    checks,
    pass: Object.values(checks).every(Boolean),
  };
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI required");
  await mongoose.connect(uri);

  const friendly = await resolveFriendlyLeagueForAudit();
  const engineUrl = resolveAmethystEngineBaseUrl();

  const primary = await runScenario(
    "pre_draft_full_board_user_expensive_quartet_team_a",
    buildPreDraftUserExpensivePayload("team_a"),
    "team_a",
  );
  const sparse = await runScenario(
    "friendly_12team_sparse_quartet_only",
    buildSparseFriendlyPayload(friendly, "team_1"),
    "team_1",
  );

  const out = {
    engine: engineUrl,
    league_id: String(friendly._id),
    league_name: friendly.name,
    canonical_friendly: String(friendly._id) === CANONICAL_FRIENDLY_LEAGUE_ID,
    scenarios: {
      primary,
      sparse: { ...sparse, informational_only: true },
    },
    pass: primary.pass,
    note:
      "Primary = pre_draft keeper board + Lindor/Crochet/Turner/Springer on team_a (Friendly import collapse). Sparse quartet-only is diagnostic only and may stay ~$5 without league-wide keeper fill.",
  };

  console.log(JSON.stringify(out, null, 2));
  await mongoose.disconnect();
  if (!out.pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
