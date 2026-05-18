/**
 * Investigate duplicate display names in Engine valuations vs Draftroom catalog.
 *
 *   AMETHYST_API_URL=http://localhost:3099 pnpm exec tsx scripts/investigate-name-collisions.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import { resolveFriendlyLeagueForAudit } from "../src/lib/canonicalAuditLeagues";
import {
  buildValuationContext,
  finalizeEngineValuationPostPayload,
} from "../src/lib/engineContext";
import { resolveAuctionCurveModelForDraftRequest } from "../src/lib/auctionCurveModel";
import { amethyst } from "../src/lib/amethyst";
import { getOrRefreshCatalogPlayers } from "../src/lib/catalogPlayerFetch";
import {
  buildCatalogIdByNormName,
  findValuationNameCollisions,
  pickCanonicalValuationRowForName,
} from "../src/lib/valuationRowLookup";

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);
  const friendly = await resolveFriendlyLeagueForAudit();
  console.log("league:", friendly._id?.toString(), friendly.name);

  const catalog = await getOrRefreshCatalogPlayers(
    friendly.posEligibilityThreshold ?? 20,
  );
  const catalogIdByNorm = buildCatalogIdByNormName(catalog);

  const ctx = await buildValuationContext(friendly, [], {
    userTeamId: "team_1",
    auctionCurveModel: resolveAuctionCurveModelForDraftRequest({}),
  });
  const payload = finalizeEngineValuationPostPayload(ctx);
  const { data: resp } = await amethyst.post("/valuation/calculate", payload);
  const draftable = new Set(
    ((resp.draftable_player_ids as string[]) ?? []).map(String),
  );
  const vals = (resp.valuations ?? []) as Array<{
    player_id?: string;
    name?: string;
    auction_value?: number;
    auction_rank?: number;
  }>;

  const collisions = findValuationNameCollisions(vals, draftable);
  console.log("Engine:", process.env.AMETHYST_API_URL ?? "(default)");
  console.log("curve:", resp.auction_curve_reason);
  console.log("draftable_pool:", draftable.size);
  console.log("\nName collisions in valuations:", collisions.length);
  for (const c of collisions.slice(0, 20)) {
    console.log(`\n[${c.norm_name}]`);
    for (const r of c.rows) {
      const cat = catalogIdByNorm.get(c.norm_name);
      console.log(
        `  id=${r.player_id} av=${r.auction_value} pool=${r.in_draftable_pool} catalog_match=${r.player_id === cat}`,
      );
    }
  }

  for (const name of ["Bryan Woo", "Shohei Ohtani", "Aaron Judge"]) {
    const catId = catalogIdByNorm.get(
      name
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""),
    );
    const cat = catalog.find((p) => String(p.id) === catId);
    const row = pickCanonicalValuationRowForName(vals, draftable, name, catalogIdByNorm);
    console.log(`\n${name}:`);
    console.log("  catalog:", cat ? { id: cat.id, team: cat.team, pos: cat.position, value: cat.value } : null);
    console.log("  canonical valuation:", row);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
