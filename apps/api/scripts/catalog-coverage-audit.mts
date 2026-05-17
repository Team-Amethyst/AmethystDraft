/**
 * Live catalog coverage audit (read-only).
 * Usage: pnpm exec tsx scripts/catalog-coverage-audit.mts
 */
import { getOrRefreshCatalogPlayers } from "../dist/lib/catalogPlayerFetch.js";

const CATALOG_RECOVERY_MLB_IDS = [
  683011, 669224, 701542, 666808, 518585, 682987,
] as const;

const RECOVERY_NAMES: Record<number, string> = {
  683011: "Anthony Volpe",
  669224: "Austin Wells",
  701542: "Will Warren",
  666808: "Camilo Doval",
  518585: "Fernando Cruz",
  682987: "Spencer Jones",
};

async function main() {
  const players = await getOrRefreshCatalogPlayers(20);
  const valuationEligible = players.filter((p) => p.valuation_eligible);
  console.log("catalog_total", players.length);
  console.log("valuation_eligible_count", valuationEligible.length);
  console.log("catalog_only_count", players.length - valuationEligible.length);

  for (const mlbId of CATALOG_RECOVERY_MLB_IDS) {
    const row = players.find((p) => p.mlbId === mlbId);
    console.log(
      RECOVERY_NAMES[mlbId] ?? mlbId,
      row
        ? {
            mlbId: row.mlbId,
            valuation_eligible: row.valuation_eligible,
            value: row.value,
            team: row.team,
          }
        : "MISSING",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
