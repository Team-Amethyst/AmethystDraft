/**
 * Research → Tiers boundary audit: Engine tiers vs display value bands.
 *
 * Usage:
 *   pnpm exec tsx scripts/tiers-display-tier-audit.mts [API_BASE]
 */
import type { Player } from "../src/types/player.ts";
import { groupPlayersByDisplayTier } from "../src/domain/displayTiers.ts";
import { runTierSeparationAudit } from "../src/utils/valueBands.ts";
import {
  calculateTierStats,
  groupPlayersByEngineTier,
  rawTierAuctionValue,
} from "../src/utils/tiers.ts";

const API_BASE = process.argv[2]?.trim() || "http://127.0.0.1:3000";

async function fetchPlayers(): Promise<Player[]> {
  const r = await fetch(`${API_BASE}/api/players?sortBy=value`);
  if (!r.ok) throw new Error(`/api/players ${r.status}`);
  const data = (await r.json()) as { players: Player[] };
  return data.players ?? [];
}

function pctile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1))),
  );
  return sorted[idx]!;
}

function summarizeTier(
  label: string,
  stats: ReturnType<typeof calculateTierStats>,
) {
  for (const s of stats) {
    const raws = s.availablePlayers
      .map((p) => rawTierAuctionValue(p))
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    console.log(`\n## ${label} T${s.tier}`);
    console.log(
      `count=${s.players.length} avail=${s.availableCount} drafted=${s.draftedCount}`,
    );
    if (raws.length === 0) {
      console.log("  (no valued available players)");
      continue;
    }
    console.log(
      `raw: min=${raws[0]!.toFixed(2)} p10=${pctile(raws, 0.1).toFixed(2)} med=${pctile(raws, 0.5).toFixed(2)} p90=${pctile(raws, 0.9).toFixed(2)} max=${raws[raws.length - 1]!.toFixed(2)} avg=${s.averageValueRaw.toFixed(2)}`,
    );
    console.log(
      `display: ${s.minValueDisplay}–${s.maxValueDisplay}  minBid=${s.isMinBidStyleTier}`,
    );
  }
}

async function main() {
  const players = await fetchPlayers();
  const draftedIds = new Set<string>();
  console.log(`API_BASE=${API_BASE} players=${players.length}`);

  const engineStats = calculateTierStats(
    groupPlayersByEngineTier(players),
    draftedIds,
  );
  const displayStats = calculateTierStats(
    groupPlayersByDisplayTier(players, { draftedIds }),
    draftedIds,
  );

  console.log("\n# Part 1 — Engine auction_tier (before)");
  summarizeTier("Engine", engineStats);

  console.log("\n# Part 1 — Display value bands (after)");
  summarizeTier("Display", displayStats);

  const report = runTierSeparationAudit(players, draftedIds);
  console.log("\n# Diagnosis (value-band audit)");
  console.log(report.diagnosisSummary);
  console.log(`Recommendation: ${report.recommendation}`);

  console.log("\n# Candidate comparison (counts)");
  console.log("| Scheme | T1 | T2 | T3 | T4 | T5 |");
  console.log("|--------|----|----|----|----|-----|");
  const engCounts = [1, 2, 3, 4, 5].map(
    (t) => engineStats.find((s) => s.tier === t)?.players.length ?? 0,
  );
  const dispCounts = [1, 2, 3, 4, 5].map(
    (t) => displayStats.find((s) => s.tier === t)?.players.length ?? 0,
  );
  console.log(`| Engine | ${engCounts.join(" | ")} |`);
  console.log(`| Display bands | ${dispCounts.join(" | ")} |`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
