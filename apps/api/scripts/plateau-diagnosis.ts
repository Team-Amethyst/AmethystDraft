/**
 * Diagnose $48 auction_value plateau on live demo league vs canonical checkpoint.
 *
 *   cd apps/api && pnpm exec tsx scripts/plateau-diagnosis.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import League from "../src/models/League";
import RosterEntry from "../src/models/RosterEntry";
import {
  buildValuationContext,
  finalizeEngineValuationPostPayload,
  leagueRosterSlotsForEngine,
  resolveLeagueNumTeams,
  valuationIncomingToEngineContext,
} from "../src/lib/engineContext";
import { resolveAuctionCurveModelForDraftRequest } from "../src/lib/auctionCurveModel";
import { amethyst } from "../src/lib/amethyst";
import { readCheckpointFixtureJson } from "../src/lib/engineCheckpointCatalog";
import { valuationIncomingSchema } from "../src/validation/schemas";

type ValRow = Record<string, unknown>;

function topN(vals: ValRow[], n = 20) {
  return [...vals]
    .filter((v) => typeof v.auction_value === "number")
    .sort((a, b) => (b.auction_value as number) - (a.auction_value as number))
    .slice(0, n)
    .map((v) => ({
      player_id: v.player_id,
      name: v.name,
      position: v.position,
      auction_value: v.auction_value,
      recommended_bid: v.recommended_bid,
      max_bid: v.max_bid,
      team_value: v.team_adjusted_value ?? v.team_value,
      edge: v.edge,
      auction_rank: v.auction_rank,
      tier: v.catalog_tier,
      auction_tier: v.auction_tier,
    }));
}

function plateauStats(vals: ValRow[]) {
  const avs = vals
    .map((v) => v.auction_value)
    .filter((x): x is number => typeof x === "number");
  const at48 = avs.filter((x) => x === 48).length;
  const sorted = [...avs].sort((a, b) => b - a);
  const firstBelow48 = sorted.findIndex((x) => x < 48);
  return {
    count_at_exactly_48: at48,
    first_rank_below_48: firstBelow48 === -1 ? null : firstBelow48 + 1,
    first_value_below_48: firstBelow48 === -1 ? null : sorted[firstBelow48],
    unique_top20_values: [...new Set(sorted.slice(0, 20))],
  };
}

async function postEngine(payload: Record<string, unknown>) {
  const { data } = await amethyst.post("/valuation/calculate", payload);
  return data as Record<string, unknown>;
}

function summarize(label: string, resp: Record<string, unknown>, payload: Record<string, unknown>) {
  const vals = (resp.valuations as ValRow[]) ?? [];
  return {
    label,
    payload_summary: {
      num_teams: payload.num_teams,
      budget_per_team: payload.budget_per_team,
      player_ids_count: Array.isArray(payload.player_ids)
        ? payload.player_ids.length
        : 0,
      drafted_players_length: Array.isArray(payload.drafted_players)
        ? payload.drafted_players.length
        : 0,
      deterministic: payload.deterministic,
      seed: payload.seed,
    },
    metadata: {
      auction_curve_model: resp.auction_curve_model,
      auction_curve_reason: resp.auction_curve_reason,
      internal_allocation_mode: resp.internal_allocation_mode,
      remaining_slots: resp.remaining_slots,
      capacity: resp.capacity,
      keeper_count: resp.keeper_count,
      draft_state_length: resp.draft_state_length,
      inflation_factor: resp.inflation_factor,
      total_budget_remaining: resp.total_budget_remaining,
      players_remaining: resp.players_remaining,
      curve_guardrails: resp.curve_guardrails,
      curve_guardrails_applied: resp.curve_guardrails_applied,
      curve_inputs: resp.curve_inputs,
      surplus_conservation_delta: resp.surplus_conservation_delta,
      selected_weights: resp.selected_weights,
    },
    plateau: plateauStats(vals),
    top20: topN(vals, 20),
  };
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI required");

  await mongoose.connect(uri);
  const league = await League.findOne({ name: /\[Demo\].*pre\s*draft/i }).lean();
  if (!league) throw new Error("Demo pre-draft league not found");
  const entries = await RosterEntry.find({ leagueId: league._id }).lean();

  const mongoCtx = await buildValuationContext(
    league as Parameters<typeof buildValuationContext>[0],
    entries as Parameters<typeof buildValuationContext>[1],
    {
      userTeamId: "team_1",
      auctionCurveModel: resolveAuctionCurveModelForDraftRequest({}),
    },
  );
  const mongoPayload = finalizeEngineValuationPostPayload(mongoCtx) as Record<
    string,
    unknown
  >;

  const rawCheckpoint = readCheckpointFixtureJson("pre_draft");
  const parsed = valuationIncomingSchema.parse(rawCheckpoint);
  const cpContext = valuationIncomingToEngineContext(parsed);
  const cpPayloadBase = finalizeEngineValuationPostPayload({
    ...cpContext,
    user_team_id: "team_1",
    auction_curve_model: resolveAuctionCurveModelForDraftRequest({}),
  }) as Record<string, unknown>;

  const cpPayloadDet = {
    ...cpPayloadBase,
    deterministic: true,
    seed: 42,
  };

  const mongoResp = await postEngine(mongoPayload);
  const cpResp = await postEngine(cpPayloadDet);

  const rosterSlots = leagueRosterSlotsForEngine(
    league as Parameters<typeof leagueRosterSlotsForEngine>[0],
  );
  const numTeams = resolveLeagueNumTeams(
    league as Parameters<typeof resolveLeagueNumTeams>[0],
  );
  const cap =
    rosterSlots.reduce((s, r) => s + r.count, 0) * numTeams;

  console.log(
    JSON.stringify(
      {
        league: { id: league._id?.toString(), name: league.name, capacity: cap },
        mongo_research_path: summarize("mongo_research", mongoResp, mongoPayload),
        checkpoint_det_seed42: summarize(
          "checkpoint_det_42",
          cpResp,
          cpPayloadDet,
        ),
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
