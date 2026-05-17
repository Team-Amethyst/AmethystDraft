/**
 * Read-only depth chart vs catalog data audit.
 * Usage: pnpm exec tsx scripts/depth-chart-data-audit.mts [API_BASE]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDepthRowResolutionCache,
  computeDepthChartMatchSummary,
  normalizeDepthPlayerName,
  resolveCatalogMatchForDepthRow,
  resolveDepthRowMatch,
  type DepthMatchMethod,
} from "../src/domain/depthChartRowMatch.ts";
import type { DepthChartPlayerRow, DepthChartResponse } from "../src/api/players.ts";
import type { Player } from "../src/types/player.ts";

const API_BASE = process.argv[2]?.trim() || "http://127.0.0.1:3000";
const TEAMS = [
  { id: 147, abbr: "NYY" },
  { id: 111, abbr: "BOS" },
  { id: 136, abbr: "SEA" },
  { id: 118, abbr: "KC" },
  { id: 141, abbr: "TOR" },
];

const SAMPLE_NAMES = [
  "Will Warren",
  "Ryan Weathers",
  "Camilo Doval",
  "Fernando Cruz",
  "Spencer Jones",
  "Victor Robles",
  "Cam Schlittler",
  "Austin Wells",
  "Ben Rice",
  "Aaron Judge",
  "Cody Bellinger",
  "J.C. Escarra",
  "Jazz Chisholm Jr.",
  "Anthony Volpe",
];

async function fetchJson<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json() as Promise<T>;
}

function hasProjection(p: Player): boolean {
  const b = p.projection?.batting;
  const pit = p.projection?.pitching;
  if (b && (b.hr != null || b.rbi != null)) return true;
  if (pit && (pit.innings != null || pit.strikeouts != null)) return true;
  return false;
}

function hasStats(p: Player): boolean {
  return Boolean(p.stats?.batting || p.stats?.pitching);
}

function catalogSearch(
  catalog: Player[],
  row: { playerId: number; playerName: string; teamAbbr: string },
): {
  byMlbId?: Player;
  byNameTeam?: Player;
  byNameOnly?: Player;
  nameVariants: Player[];
} {
  const norm = normalizeDepthPlayerName(row.playerName);
  const byMlbId = catalog.find((p) => p.mlbId === row.playerId);
  const byNameTeam = catalog.find(
    (p) =>
      p.name &&
      normalizeDepthPlayerName(p.name) === norm &&
      p.team?.toUpperCase() === row.teamAbbr.toUpperCase(),
  );
  const byNameOnly = catalog.find(
    (p) => p.name && normalizeDepthPlayerName(p.name) === norm,
  );
  const nameVariants = catalog.filter((p) => {
    if (!p.name) return false;
    const pn = normalizeDepthPlayerName(p.name);
    return pn.includes(norm) || norm.includes(pn);
  });
  return { byMlbId, byNameTeam, byNameOnly, nameVariants };
}

function flattenDepth(
  chart: DepthChartResponse,
  teamAbbr: string,
): Array<DepthChartPlayerRow & { chartPosition: string; teamAbbr: string }> {
  const out: Array<DepthChartPlayerRow & { chartPosition: string; teamAbbr: string }> =
    [];
  for (const [pos, rows] of Object.entries(chart.positions)) {
    for (const row of rows) {
      out.push({ ...row, chartPosition: pos, teamAbbr });
    }
  }
  return out;
}

function countByMethod(rows: ReturnType<typeof flattenDepth>, catalog: Player[], abbr: string) {
  const counts: Record<DepthMatchMethod, number> = {
    exact_mlb_id: 0,
    normalized_name_and_team: 0,
    normalized_name: 0,
    none: 0,
  };
  for (const row of rows) {
    const m = resolveCatalogMatchForDepthRow(catalog, row, abbr).method;
    counts[m]++;
  }
  return counts;
}

async function main() {
  console.log(`API: ${API_BASE}\n`);

  const catalogRaw = await fetchJson<{ players: Player[] }>(
    "/api/players?sort=catalog_rank&posEligibilityThreshold=20",
  );
  mkdirSync(dirname(fileURLToPath(import.meta.url)), { recursive: true });
  writeFileSync(
    join(dirname(fileURLToPath(import.meta.url)), ".audit-cache-catalog.json"),
    JSON.stringify(catalogRaw),
  );
  const catalog = catalogRaw.players;
  console.log(`Catalog size: ${catalog.length}\n`);

  const teamSummaries: Array<Record<string, string | number>> = [];
  const allDepthOnly: Array<{
    team: string;
    name: string;
    mlbId: number;
    pos: string;
    catalogAbsent: boolean;
    directMlbIdInCatalog: boolean;
    directNameInCatalog: boolean;
  }> = [];

  let nyyRows: ReturnType<typeof flattenDepth> = [];

  for (const team of TEAMS) {
    const chart = await fetchJson<DepthChartResponse>(
      `/api/players/depth-chart/${team.id}?refresh=1`,
    );
    const rows = flattenDepth(chart, team.abbr);
    if (team.abbr === "NYY") nyyRows = rows;

    const cache = buildDepthRowResolutionCache(
      chart,
      team.abbr,
      catalog,
      [],
      [],
      new Map(),
    );
    const summary = computeDepthChartMatchSummary(
      chart,
      team.abbr,
      catalog,
      [],
      [],
      new Map(),
    );
    const methods = countByMethod(rows, catalog, team.abbr);

    const stateCounts = { rostered: 0, valued: 0, catalog_only: 0, depth_only: 0, unmatched: 0 };
    for (const row of rows) {
      const st = resolveDepthRowMatch(
        row,
        row.chartPosition,
        team.abbr,
        catalog,
        [],
        [],
        new Map(),
      ).state;
      stateCounts[st]++;
      if (st === "depth_only") {
        const search = catalogSearch(catalog, {
          playerId: row.playerId,
          playerName: row.playerName,
          teamAbbr: team.abbr,
        });
        allDepthOnly.push({
          team: team.abbr,
          name: row.playerName,
          mlbId: row.playerId,
          pos: row.chartPosition,
          catalogAbsent: !search.byMlbId && !search.byNameTeam && !search.byNameOnly,
          directMlbIdInCatalog: Boolean(search.byMlbId),
          directNameInCatalog: Boolean(search.byNameOnly),
        });
      }
    }

    teamSummaries.push({
      Team: team.abbr,
      "depth rows": rows.length,
      "exact MLB ID": methods.exact_mlb_id,
      "name+team": methods.normalized_name_and_team,
      "name only": methods.normalized_name,
      "no catalog match": methods.none,
      rostered: stateCounts.rostered,
      valued: stateCounts.valued,
      "catalog only": stateCounts.catalog_only,
      "depth only": stateCounts.depth_only,
      unmatched: stateCounts.unmatched,
    });

    console.log(`--- ${team.abbr} depth source ---`);
    console.log(`  assignments: ${rows.length}, roster ${chart.rosterCount}/${chart.rosterLimit}`);
    console.log(`  generated: ${chart.generatedAt}`);
    console.log(`  manual review: ${chart.manualReview.length}`);
    const dupes = new Map<number, string[]>();
    for (const r of rows) {
      const list = dupes.get(r.playerId) ?? [];
      list.push(r.chartPosition);
      dupes.set(r.playerId, list);
    }
    const multi = [...dupes.entries()].filter(([, ps]) => ps.length > 1);
    console.log(`  multi-position players: ${multi.length}`);
    if (multi.length) {
      console.log(
        `    e.g. ${multi
          .slice(0, 5)
          .map(([id, ps]) => `${rows.find((r) => r.playerId === id)?.playerName} (${ps.join(",")})`)
          .join("; ")}`,
      );
    }
  }

  console.log("\n=== Multi-team summary table ===");
  console.table(teamSummaries);

  console.log("\n=== NYY per-row audit ===");
  const nyyTable = nyyRows.map((row) => {
    const match = resolveCatalogMatchForDepthRow(catalog, row, "NYY");
    const resolution = resolveDepthRowMatch(
      row,
      row.chartPosition,
      "NYY",
      catalog,
      [],
      [],
      new Map(),
    );
    const cat = match.player;
    const search = catalogSearch(catalog, {
      playerId: row.playerId,
      playerName: row.playerName,
      teamAbbr: "NYY",
    });
    return {
      Pos: row.chartPosition,
      Rank: row.rank,
      Name: row.playerName,
      MLB: row.playerId,
      Badge: resolution.state,
      Method: match.method,
      Conf: match.confidence,
      "Cat ID": cat?.id ?? "—",
      "In catalog (direct ID)": search.byMlbId ? "Y" : "N",
      "val_eligible": cat?.valuation_eligible ?? "—",
      "has proj": cat ? (hasProjection(cat) ? "Y" : "N") : "—",
      "catalog_rank": cat?.catalog_rank ?? "—",
    };
  });
  console.table(nyyTable);

  console.log("\n=== Sample player deep dive ===");
  const sampleTable = SAMPLE_NAMES.map((name) => {
    const norm = normalizeDepthPlayerName(name);
    const inCatalog = catalog.filter(
      (p) => p.name && normalizeDepthPlayerName(p.name) === norm,
    );
    const inCatalogByPartial = catalog.filter((p) =>
      p.name?.toLowerCase().includes(name.split(" ")[0]!.toLowerCase()),
    );
    const depthRow = nyyRows.find(
      (r) => normalizeDepthPlayerName(r.playerName) === norm,
    );
    const match = depthRow
      ? resolveCatalogMatchForDepthRow(catalog, depthRow, "NYY")
      : null;
    const resolution = depthRow
      ? resolveDepthRowMatch(depthRow, depthRow.chartPosition, "NYY", catalog, [], [], new Map())
      : null;
    return {
      Name: name,
      "NYY depth": depthRow ? `${depthRow.chartPosition}#${depthRow.rank}` : "—",
      "MLB ID (depth)": depthRow?.playerId ?? "—",
      "Catalog rows": inCatalog.length,
      "Catalog MLB": inCatalog.map((p) => p.mlbId).join(",") || "—",
      "Match method": match?.method ?? "—",
      Badge: resolution?.state ?? (inCatalog.length ? "in catalog, not on NYY depth" : "—"),
      "val_eligible": inCatalog[0]?.valuation_eligible ?? "—",
      "has projection": inCatalog[0] ? (hasProjection(inCatalog[0]) ? "Y" : "N") : "—",
    };
  });
  console.table(sampleTable);

  console.log("\n=== Depth-only players: truly absent from catalog? ===");
  const depthOnlyAbsent = allDepthOnly.filter((d) => d.catalogAbsent);
  const depthOnlyFalseNeg = allDepthOnly.filter((d) => d.directMlbIdInCatalog || d.directNameInCatalog);
  console.log(`  Total depth-only across 5 teams: ${allDepthOnly.length}`);
  console.log(`  Truly absent from catalog (ID+name search): ${depthOnlyAbsent.length}`);
  console.log(`  In catalog but depth-only badge (MATCH BUG): ${depthOnlyFalseNeg.length}`);
  if (depthOnlyFalseNeg.length) {
    console.table(depthOnlyFalseNeg);
  }

  console.log("\n=== Catalog-only on NYY (matched catalog, no valuation board) ===");
  const catalogOnly = nyyRows.filter((row) => {
    const st = resolveDepthRowMatch(row, row.chartPosition, "NYY", catalog, [], [], new Map()).state;
    return st === "catalog_only";
  });
  console.log(
    catalogOnly.map((r) => r.playerName).join(", ") || "(none without league valuations loaded)",
  );

  const falseNeg = nyyRows.filter((row) => {
    const st = resolveDepthRowMatch(row, row.chartPosition, "NYY", catalog, [], [], new Map()).state;
    if (st !== "depth_only") return false;
    const s = catalogSearch(catalog, {
      playerId: row.playerId,
      playerName: row.playerName,
      teamAbbr: "NYY",
    });
    return Boolean(s.byMlbId || s.byNameTeam);
  });
  if (falseNeg.length) {
    console.log("\n⚠️  MATCH BUG candidates (catalog exists, badge=depth_only):");
    console.table(
      falseNeg.map((r) => ({
        name: r.playerName,
        mlbId: r.playerId,
        pos: r.chartPosition,
      })),
    );
  } else {
    console.log("\n✓ No NYY depth_only rows with catalog record found (matching consistent)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
