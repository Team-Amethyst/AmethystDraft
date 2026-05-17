/**
 * Live Research valuation verification (Mongo demo league vs canonical checkpoint).
 *
 *   cd apps/api && pnpm exec tsx scripts/verify-research-live-valuation.ts
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
import { isReserveRosterSlot } from "../src/lib/demoLeagueFixtureGolden";

const JUDGE_ID = "592450";

function topByAuction(
  valuations: Array<{
    name?: string;
    player_id?: string;
    auction_value?: number;
    recommended_bid?: number;
  }>,
  n = 10,
) {
  return [...valuations]
    .filter((v) => typeof v.auction_value === "number")
    .sort((a, b) => (b.auction_value ?? 0) - (a.auction_value ?? 0))
    .slice(0, n)
    .map((v) => ({
      name: v.name,
      player_id: v.player_id,
      auction_value: v.auction_value,
      recommended_bid: v.recommended_bid,
    }));
}

function slotCapacity(
  rosterSlots: { position: string; count: number }[],
  numTeams: number,
): number {
  return rosterSlots.reduce((s, r) => s + r.count, 0) * numTeams;
}

function countLeagueState(
  entries: Array<{
    isKeeper?: boolean;
    rosterSlot?: string;
    playerId?: string;
  }>,
  draftedOnly: Array<{ player_id?: string }>,
) {
  const keepers = entries.filter(
    (e) => e.isKeeper && !isReserveRosterSlot(e.rosterSlot ?? ""),
  ).length;
  const auctionDrafted = entries.filter(
    (e) =>
      !e.isKeeper &&
      !isReserveRosterSlot(e.rosterSlot ?? ""),
  ).length;
  return { keepers, auctionDrafted };
}

async function postEngine(payload: Record<string, unknown>) {
  const { data } = await amethyst.post("/valuation/calculate", payload);
  return data as Record<string, unknown>;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI required");

  await mongoose.connect(uri);

  const demoLeagues = await League.find({
    name: /\[Demo\].*pre\s*draft/i,
  })
    .sort({ updatedAt: -1 })
    .limit(3)
    .lean();

  if (demoLeagues.length === 0) {
    console.log("No [Demo] pre draft league in Mongo — trying any [Demo] league:");
    const anyDemo = await League.find({ name: /\[Demo\]/i }).limit(5).lean();
    for (const l of anyDemo) console.log(" ", l._id?.toString(), l.name);
  }

  const league = demoLeagues[0];
  if (!league) {
    console.error("Create or refresh demo league first (refresh-demo-pre-draft-league.mjs)");
    process.exit(1);
  }

  const leagueId = league._id!.toString();
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
  const rosterSlots = leagueRosterSlotsForEngine(
    league as Parameters<typeof leagueRosterSlotsForEngine>[0],
  );
  const numTeams = resolveLeagueNumTeams(
    league as Parameters<typeof resolveLeagueNumTeams>[0],
  );
  const cap = slotCapacity(rosterSlots, numTeams);
  const drafted = (payload.drafted_players as unknown[]) ?? [];
  const pre = (payload.pre_draft_rosters as { players?: unknown[] }[]) ?? [];
  let pdrKeepers = 0;
  for (const sec of pre) {
    const rows = sec.players ?? [];
    pdrKeepers += rows.filter(
      (r) =>
        typeof r === "object" &&
        r != null &&
        (r as { is_keeper?: boolean }).is_keeper,
    ).length;
  }
  const mongoCounts = countLeagueState(
    entries.map((e) => ({
      isKeeper: e.isKeeper,
      rosterSlot: e.rosterSlot,
    })),
    drafted as { player_id?: string }[],
  );

  console.log("\n=== Mongo demo league (Research POST /valuation path) ===");
  console.log("league:", leagueId, league.name);
  console.log("payload vs mongo:", {
    capacity: cap,
    drafted_players_length: drafted.length,
    pre_draft_keeper_sections: pdrKeepers,
    mongo_active_keepers: mongoCounts.keepers,
    mongo_active_auction: mongoCounts.auctionDrafted,
    has_player_ids: Array.isArray(payload.player_ids)
      ? payload.player_ids.length
      : 0,
    deterministic: payload.deterministic,
    seed: payload.seed,
    auction_curve_model: payload.auction_curve_model,
  });

  const liveResp = await postEngine(payload);
  const judge = (
    liveResp.valuations as Array<Record<string, unknown>>
  )?.find((v) => String(v.player_id) === JUDGE_ID);

  console.log("\nEngine response (live mongo path):");
  console.log({
    auction_curve_model: liveResp.auction_curve_model,
    auction_curve_reason: liveResp.auction_curve_reason,
    internal_allocation_mode: liveResp.internal_allocation_mode,
    remaining_slots: liveResp.remaining_slots,
    inflation_factor: liveResp.inflation_factor,
  });
  console.log("top10 by auction_value:", topByAuction(liveResp.valuations as []));
  console.log("Aaron Judge:", judge
    ? {
        auction_value: judge.auction_value,
        recommended_bid: judge.recommended_bid,
        baseline_value: judge.baseline_value,
        auction_rank: judge.auction_rank,
      }
    : "not in valuations[]");

  const rawCheckpoint = readCheckpointFixtureJson("pre_draft");
  const parsed = valuationIncomingSchema.parse(rawCheckpoint);
  const cpContext = valuationIncomingToEngineContext(parsed);
  const cpPayload = finalizeEngineValuationPostPayload({
    ...cpContext,
    user_team_id: "team_1",
    auction_curve_model: resolveAuctionCurveModelForDraftRequest({}),
    deterministic: true,
    seed: 42,
  }) as Record<string, unknown>;

  console.log("\n=== Canonical checkpoint fixture (not Research path) ===");
  console.log({
    drafted_players_length: (cpPayload.drafted_players as unknown[])?.length ?? 0,
    auction_curve_model: cpPayload.auction_curve_model,
  });

  const cpResp = await postEngine(cpPayload);
  console.log({
    auction_curve_model: cpResp.auction_curve_model,
    auction_curve_reason: cpResp.auction_curve_reason,
    internal_allocation_mode: cpResp.internal_allocation_mode,
    remaining_slots: cpResp.remaining_slots,
  });
  console.log("top10 by auction_value:", topByAuction(cpResp.valuations as []));
  const cpJudge = (cpResp.valuations as Array<Record<string, unknown>>)?.find(
    (v) => String(v.player_id) === JUDGE_ID,
  );
  console.log("Aaron Judge:", cpJudge?.auction_value, "recommended", cpJudge?.recommended_bid);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
