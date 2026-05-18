/**
 * Audit a single Mongo league's valuation path (aligned vs flat board).
 *
 *   cd apps/api && pnpm exec tsx scripts/audit-league-valuation.ts
 *   cd apps/api && pnpm exec tsx scripts/audit-league-valuation.ts --name "Original"
 *   cd apps/api && pnpm exec tsx scripts/audit-league-valuation.ts --id <leagueId>
 */
import "dotenv/config";
import mongoose from "mongoose";
import League from "../src/models/League";
import RosterEntry from "../src/models/RosterEntry";
import {
  buildEngineValuationCalculateBodyFromFixture,
  buildValuationContext,
  finalizeEngineValuationPostPayload,
} from "../src/lib/engineContext";
import { resolveAuctionCurveModelForDraftRequest } from "../src/lib/auctionCurveModel";
import { amethyst } from "../src/lib/amethyst";
import { readCheckpointFixtureJson } from "../src/lib/engineCheckpointCatalog";
import { getOrRefreshCatalogPlayers } from "../src/lib/catalogPlayerFetch";
import { resolveLeagueForAudit } from "../src/lib/canonicalAuditLeagues";
import {
  buildCatalogIdByNormName,
  findValuationNameCollisions,
  normValuationPlayerName,
  pickCanonicalValuationRowForName,
} from "../src/lib/valuationRowLookup";

const TRACKED = [
  "Shohei Ohtani",
  "Tarik Skubal",
  "Aaron Judge",
  "Juan Soto",
  "Julio Rodríguez",
  "Bobby Witt Jr.",
  "José Ramírez",
  "Cal Raleigh",
  "Bryan Woo",
  "Garrett Crochet",
  "Hunter Brown",
];

function displayTier(raw: number): number {
  if (!Number.isFinite(raw) || raw < 1) return 5;
  if (raw >= 25) return 1;
  if (raw >= 15) return 2;
  if (raw >= 10) return 3;
  if (raw >= 5) return 4;
  return 5;
}

function tierCounts(
  rows: Array<{ auction_value?: number }>,
): Record<string, number> {
  const c = { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };
  for (const r of rows) {
    const av = r.auction_value;
    if (typeof av !== "number" || !Number.isFinite(av)) continue;
    const t = displayTier(av);
    c[`T${t}` as keyof typeof c]++;
  }
  return c;
}

function countCapShelf(
  sorted: Array<{ auction_value?: number }>,
  within = 0.6,
): { top: number; count: number } {
  const top = sorted[0]?.auction_value ?? 0;
  const count = sorted.filter(
    (r) =>
      typeof r.auction_value === "number" &&
      top - r.auction_value <= within,
  ).length;
  return { top, count };
}

async function postEngine(payload: Record<string, unknown>) {
  const { data } = await amethyst.post("/valuation/calculate", payload);
  return data as Record<string, unknown>;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI required");

  const idArg = process.argv.indexOf("--id");
  const nameArg = process.argv.indexOf("--name");
  const leagueId =
    idArg >= 0 ? process.argv[idArg + 1] : undefined;
  const namePattern =
    nameArg >= 0
      ? new RegExp(process.argv[nameArg + 1] ?? "Original", "i")
      : /original/i;

  await mongoose.connect(uri);

  const catalog = await getOrRefreshCatalogPlayers(20);
  const catalogIdByNorm = buildCatalogIdByNormName(catalog);

  let league;
  try {
    league = await resolveLeagueForAudit({
      leagueId,
      namePattern: leagueId ? undefined : namePattern,
    });
  } catch {
    console.error("No league matching", namePattern);
    const recent = await League.find({})
      .sort({ updatedAt: -1 })
      .limit(15)
      .select("name _id updatedAt")
      .lean();
    console.log("Recent leagues:");
    for (const l of recent) {
      console.log(" ", l._id?.toString(), l.name);
    }
    process.exit(1);
  }

  const entries = await RosterEntry.find({ leagueId: league._id }).lean();
  const keepers = entries.filter((e) => e.isKeeper);
  const auctionPicks = entries.filter((e) => !e.isKeeper);

  console.log("\n=== League state ===");
  console.log({
    id: String(league._id),
    name: league.name,
    teams: league.teams,
    budget: league.budget,
    rosterSlots: league.rosterSlots,
    scoringFormat: league.scoringFormat,
    playerPool: league.playerPool,
    posEligibilityThreshold: league.posEligibilityThreshold,
    roster_entries_total: entries.length,
    keepers: keepers.length,
    auction_picks: auctionPicks.length,
    DRAFTROOM_SYNC: process.env.DRAFTROOM_SYNC_CATALOG_ELIGIBILITY_TO_ENGINE ?? "(unset)",
    git_hint: "run from repo with `git rev-parse HEAD`",
  });

  if (auctionPicks.length > 0) {
    console.log("\nAuction picks (first 15):");
    for (const e of auctionPicks.slice(0, 15)) {
      console.log(" ", e.teamId, e.playerId, e.price, e.rosterSlot);
    }
  }

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

  console.log("\n=== BFF → Engine payload counts ===");
  console.log({
    opening_board_calibration: payload.opening_board_calibration ?? null,
    player_ids: Array.isArray(payload.player_ids)
      ? payload.player_ids.length
      : 0,
    position_overrides: Array.isArray(payload.position_overrides)
      ? payload.position_overrides.length
      : 0,
    injury_overrides: Array.isArray(payload.injury_overrides)
      ? payload.injury_overrides.length
      : 0,
    eligible_player_ids: Array.isArray(payload.eligible_player_ids)
      ? payload.eligible_player_ids.length
      : 0,
    drafted_players: Array.isArray(payload.drafted_players)
      ? payload.drafted_players.length
      : 0,
    pre_draft_rosters: Array.isArray(payload.pre_draft_rosters)
      ? payload.pre_draft_rosters.length
      : 0,
    total_budget: payload.total_budget,
    num_teams: payload.num_teams,
    auction_curve_model: payload.auction_curve_model,
  });

  const resp = await postEngine(payload);
  const valuations = (resp.valuations ?? []) as Array<{
    player_id?: string;
    name?: string;
    auction_value?: number;
    auction_rank?: number;
  }>;
  const draftableIds = new Set(
    ((resp.draftable_player_ids as string[]) ?? []).map(String),
  );
  const draftable = valuations.filter(
    (v) => v.player_id && draftableIds.has(String(v.player_id)),
  );
  const sorted = [...draftable].sort(
    (a, b) => (b.auction_value ?? 0) - (a.auction_value ?? 0),
  );

  const collisions = findValuationNameCollisions(valuations, draftableIds);
  const shelf = countCapShelf(sorted);

  const util =
    (resp.replacement_values_by_slot_or_position as Record<string, number>)
      ?.UTIL ?? null;

  console.log("\n=== Engine response ===");
  console.log({
    draftable_pool: draftableIds.size,
    inflation_factor: resp.inflation_factor,
    UTIL_replacement: util,
    total_surplus_mass: resp.total_surplus_mass,
    surplus_cash: resp.surplus_cash,
    auction_curve_reason: resp.auction_curve_reason,
    internal_allocation_mode: resp.internal_allocation_mode,
    remaining_slots: resp.remaining_slots,
    max_auction: sorted[0]?.auction_value,
    top1: sorted[0]?.name,
    cap_shelf_within_0_60: shelf,
    tier_counts: tierCounts(draftable),
    valuation_name_collisions: collisions.length,
  });

  if (collisions.length > 0) {
    console.log("\n=== Valuation name collisions (Engine rows) ===");
    for (const c of collisions.slice(0, 12)) {
      console.log(`  ${c.norm_name}:`);
      for (const row of c.rows) {
        const cat = catalogIdByNorm.get(c.norm_name);
        const mark =
          row.player_id === cat
            ? "catalog"
            : row.in_draftable_pool
              ? "draftable"
              : "other";
        console.log(
          `    ${mark.padEnd(9)} ${row.player_id} $${row.auction_value?.toFixed(2) ?? "—"} ${row.name}`,
        );
      }
    }
  }

  console.log("\nTop 25 auction_value (raw sort — may duplicate names):");
  for (const r of sorted.slice(0, 25)) {
    console.log(
      `  ${String(r.auction_rank ?? "").padStart(3)} ${(r.auction_value ?? 0).toFixed(2).padStart(6)} ${r.name} [${r.player_id}]`,
    );
  }

  console.log("\n=== Tracked players (canonical catalog row) ===");
  console.log("Player | catalog_id | auction | in_pool");
  for (const name of TRACKED) {
    const row = pickCanonicalValuationRowForName(
      valuations,
      draftableIds,
      name,
      catalogIdByNorm,
    );
    const catId = catalogIdByNorm.get(normValuationPlayerName(name));
    console.log(
      `${name} | ${catId ?? "—"} | ${row?.auction_value?.toFixed(2) ?? "—"} | ${row?.player_id ? draftableIds.has(String(row.player_id)) : false}`,
    );
  }

  // Accepted checkpoint reference
  const cp = readCheckpointFixtureJson("pre_draft");
  const cpBody = finalizeEngineValuationPostPayload(
    buildEngineValuationCalculateBodyFromFixture(cp),
  ) as Record<string, unknown>;
  const cpResp = await postEngine(cpBody);
  const cpVals = (cpResp.valuations ?? []) as Array<{
    name?: string;
    auction_value?: number;
  }>;
  const cpByName = new Map(
    cpVals.map((v) => [normValuationPlayerName(v.name ?? ""), v.auction_value]),
  );

  console.log("\n=== Player comparison (accepted pre_draft fixture vs canonical league) ===");
  console.log(
    "Player | Accepted fresh | League canonical | Diff",
  );
  for (const name of TRACKED) {
    const live = pickCanonicalValuationRowForName(
      valuations,
      draftableIds,
      name,
      catalogIdByNorm,
    );
    const acc = cpByName.get(normValuationPlayerName(name));
    const liveV = live?.auction_value;
    const diff =
      typeof acc === "number" && typeof liveV === "number"
        ? liveV - acc
        : "n/a";
    console.log(
      `${name} | ${acc?.toFixed(2) ?? "—"} | ${liveV?.toFixed(2) ?? "—"} | ${typeof diff === "number" ? diff.toFixed(2) : diff}`,
    );
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
