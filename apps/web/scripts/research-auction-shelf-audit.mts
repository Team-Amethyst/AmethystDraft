/**
 * Research auction value shelf audit — top N valued players, raw vs rounded display.
 *
 * Usage:
 *   pnpm exec tsx scripts/research-auction-shelf-audit.mts [API_BASE]
 */
import {
  buildResearchAuctionShelfAuditRows,
  summarizeAuctionValueShelfSpread,
} from "../src/domain/researchAuctionValueDisplay.ts";

const API_BASE = process.argv[2]?.trim() || "http://127.0.0.1:3000";

type AuditPlayer = {
  id: string;
  name: string;
  auction_value?: number;
  auction_rank?: number;
  auction_tier?: number;
  valuation_eligible?: boolean;
  valuation_explain?: { surplus_basis?: string };
};

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s.padEnd(n);
}

async function fetchPlayers(): Promise<AuditPlayer[]> {
  const r = await fetch(`${API_BASE}/api/players?sortBy=value`);
  if (!r.ok) throw new Error(`/api/players ${r.status}`);
  const data = (await r.json()) as { players: AuditPlayer[] };
  return data.players ?? [];
}

async function main() {
  console.log(`API_BASE=${API_BASE}`);
  console.log("");

  const players = await fetchPlayers();
  const rows = buildResearchAuctionShelfAuditRows(
    players as Parameters<typeof buildResearchAuctionShelfAuditRows>[0],
    25,
  );
  const summary = summarizeAuctionValueShelfSpread(rows);

  console.log(
    "player".padEnd(28) +
      pad("raw", 10) +
      pad("shown", 8) +
      pad("rank", 6) +
      pad("tier", 6) +
      "surplus_basis",
  );
  console.log("-".repeat(90));

  for (const r of rows) {
    console.log(
      pad(r.name, 28) +
        pad(r.auctionValueRaw.toFixed(2), 10) +
        pad(r.displayedWhole, 8) +
        pad(r.auctionRank != null ? String(r.auctionRank) : "—", 6) +
        pad(r.auctionTier != null ? String(r.auctionTier) : "—", 6) +
        (r.surplusBasis ?? "—"),
    );
  }

  console.log("");
  console.log("Shelf summary (top 25):");
  console.log(`  unique raw values:       ${summary.uniqueRawCount}`);
  console.log(`  unique displayed values: ${summary.uniqueDisplayedCount}`);
  console.log(`  raw range:               $${summary.rawMin.toFixed(2)} – $${summary.rawMax.toFixed(2)}`);
  console.log(
    `  flatness mostly rounding:  ${summary.mostlyRounding ? "YES — display is compressing spread" : "NO — raw values may also be clustered"}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
