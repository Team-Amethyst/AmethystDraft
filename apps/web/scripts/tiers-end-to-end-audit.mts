/**
 * Research → Tiers end-to-end audit (read-only diagnostics).
 *
 * Usage:
 *   pnpm exec tsx scripts/tiers-end-to-end-audit.mts [API_BASE]
 *
 * Loads catalog players; pass merged engine board via Research UI export or extend script
 * with league valuation merge for full fidelity.
 */
import type { Player } from "../src/types/player.ts";
import {
  formatTiersAuditReportForConsole,
  runTiersEndToEndAudit,
} from "../src/domain/tiersEndToEndAudit.ts";

const API_BASE = process.argv[2]?.trim() || "http://127.0.0.1:3000";

async function fetchPlayers(): Promise<Player[]> {
  const r = await fetch(`${API_BASE}/api/players?sortBy=value`);
  if (!r.ok) throw new Error(`/api/players ${r.status}`);
  const data = (await r.json()) as { players: Player[] };
  return data.players ?? [];
}

async function main() {
  const players = await fetchPlayers();
  const valued = players.filter(
    (p) =>
      typeof p.auction_value === "number" &&
      Number.isFinite(p.auction_value) &&
      p.valuation_eligible !== false,
  );

  console.log(`API_BASE=${API_BASE}`);
  console.log(`players=${players.length} with_auction_value=${valued.length}`);
  console.log("");

  const report = runTiersEndToEndAudit({
    players,
    draftedIds: new Set(),
  });

  console.log(formatTiersAuditReportForConsole(report));

  console.log("");
  console.log("Top 25 valued by raw auction (audit sample):");
  const top = [...valued]
    .sort((a, b) => (b.auction_value ?? 0) - (a.auction_value ?? 0))
    .slice(0, 25);
  for (const p of top) {
    const row = report.playerRows.find((r) => r.playerId === p.id);
    console.log(
      `${p.name.padEnd(24)} raw=${(p.auction_value ?? 0).toFixed(2)} show=$${Math.round(p.auction_value ?? 0)} rank=${p.auction_rank ?? "—"} tier=T${p.auction_tier ?? "?"} class=${row?.playerClass ?? "?"}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
