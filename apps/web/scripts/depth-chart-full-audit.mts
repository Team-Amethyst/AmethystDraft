/**
 * Full depth chart audit across teams (read-only).
 * Usage: pnpm exec tsx scripts/depth-chart-full-audit.mts [API_BASE]
 */
import {
  buildDepthRowResolutionCache,
  resolveDepthRowRightDisplay,
  resolveDepthRowMatch,
} from "../src/domain/depthChartRowMatch.ts";
import type { DepthChartPlayerRow, DepthChartResponse } from "../src/api/players.ts";
import type { Player } from "../src/types/player.ts";
import type { ValuationShape } from "../src/utils/valuation.ts";

const MLB_API = "https://statsapi.mlb.com/api/v1";
const API_BASE = process.argv[2]?.trim() || "http://127.0.0.1:3000";
const SEASON = new Date().getFullYear();

const TEAMS = [
  { id: 147, abbr: "NYY" },
  { id: 146, abbr: "MIA" },
  { id: 111, abbr: "BOS" },
  { id: 136, abbr: "SEA" },
  { id: 118, abbr: "KC" },
  { id: 141, abbr: "TOR" },
  { id: 119, abbr: "LAD" },
] as const;

const NYY_SAMPLES = [
  "Aaron Judge",
  "Cody Bellinger",
  "Spencer Jones",
  "J.C. Escarra",
  "Anthony Volpe",
  "Austin Wells",
  "Will Warren",
  "Camilo Doval",
  "Fernando Cruz",
];

const MIA_SAMPLES = [
  "Leo Jiménez",
  "Javier Sanoja",
  "Liam Hicks",
  "Kyle Stowers",
  "Connor Norby",
  "Sandy Alcantara",
  "Eury Pérez",
  "Max Meyer",
];

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json() as Promise<T>;
}

type MlbEntry = {
  person?: { id?: number; fullName?: string };
  position?: { abbreviation?: string };
  status?: { description?: string };
};

function flattenChart(chart: DepthChartResponse, teamAbbr: string, catalog: Player[]) {
  const rows: Array<{
    card: string;
    rank: number;
    name: string;
    mlbId: number;
    status: string;
    state: string;
    right: string;
    match: string;
    auction?: number;
  }> = [];

  const valuations = new Map<string, ValuationShape>();
  for (const p of catalog) {
    if (p.auction_value != null && Number.isFinite(p.auction_value)) {
      valuations.set(p.id, { player_id: p.id, auction_value: p.auction_value });
      if (p.mlbId != null) valuations.set(String(p.mlbId), { player_id: p.id, auction_value: p.auction_value });
    }
  }

  const cache = buildDepthRowResolutionCache(chart, teamAbbr, catalog, [], [], valuations);

  for (const [card, list] of Object.entries(chart.positions)) {
    for (const row of list) {
      const res = cache.get(`mlb:${row.playerId}`) ??
        resolveDepthRowMatch(row, card, teamAbbr, catalog, [], [], valuations);
      const right = resolveDepthRowRightDisplay(res, row, valuations, [], []);
      const rightLabel =
        right?.kind === "auction"
          ? `$${right.formattedValue}`
          : right?.kind === "rostered_won"
            ? `${right.teamName} ${right.formattedPrice}`
            : right?.kind === "dash"
              ? "(empty)"
              : right?.kind === "status"
                ? right.label
                : "—";
      rows.push({
        card,
        rank: row.rank,
        name: row.playerName,
        mlbId: row.playerId,
        status: row.status,
        state: res.state,
        right: rightLabel,
        match: res.matchMethod,
        auction: res.audit.fantasy.hasAuctionValue
          ? catalog.find((p) => p.mlbId === row.playerId)?.auction_value
          : undefined,
      });
    }
  }
  return rows;
}

function classifySourceRelation(
  activeIds: Set<number>,
  depthSource: MlbEntry[],
  renderRow: { card: string; mlbId: number },
): string {
  const inActive = activeIds.has(renderRow.mlbId);
  const depthListings = depthSource.filter((e) => e.person?.id === renderRow.mlbId);
  if (!inActive) return "F — not on active roster (bug)";
  if (renderRow.card === "SP" || renderRow.card === "RP") {
    const hasP = depthListings.some((e) =>
      ["P", "CP", "SP", "RP"].includes(e.position?.abbreviation?.toUpperCase() ?? ""),
    );
    if (hasP || depthListings.length === 0) return "D — fantasy SP/RP synthesis";
  }
  const exact = depthListings.find(
    (e) => e.position?.abbreviation?.toUpperCase() === renderRow.card,
  );
  if (exact) return "A — exact MLB depth listing";
  if (depthListings.length > 0) return "B/C — active roster + eligibility/usage rank";
  return "C — active roster fill (no depth listing at card)";
}

async function auditTeam(
  team: (typeof TEAMS)[number],
  catalog: Player[],
) {
  const [active, depthSrc, chart] = await Promise.all([
    fetchJson<{ roster?: MlbEntry[] }>(
      `${MLB_API}/teams/${team.id}/roster?rosterType=active&season=${SEASON}`,
    ),
    fetchJson<{ roster?: MlbEntry[] }>(
      `${MLB_API}/teams/${team.id}/roster?rosterType=depthChart&season=${SEASON}`,
    ),
    fetchJson<DepthChartResponse>(
      `${API_BASE}/api/players/depth-chart/${team.id}?season=${SEASON}`,
    ),
  ]);

  const activeIds = new Set(
    (active.roster ?? [])
      .map((e) => e.person?.id)
      .filter((id): id is number => typeof id === "number"),
  );
  const rendered = flattenChart(chart, team.abbr, catalog);

  const multi = new Map<number, string[]>();
  for (const r of rendered) {
    const list = multi.get(r.mlbId) ?? [];
    list.push(`${r.card}#${r.rank}`);
    multi.set(r.mlbId, list);
  }

  const depthMulti = new Map<number, string[]>();
  for (const e of depthSrc.roster ?? []) {
    const id = e.person?.id;
    if (!id) continue;
    const list = depthMulti.get(id) ?? [];
    list.push(`${e.position?.abbreviation}#${list.length + 1}`);
    depthMulti.set(id, list);
  }

  return {
    team: team.abbr,
    activeRoster: activeIds.size,
    mlbDepthRows: depthSrc.roster?.length ?? 0,
    rendered: rendered.length,
    multiCardPlayers: [...multi.entries()].filter(([, p]) => p.length > 1).length,
    multiSourceListings: [...depthMulti.entries()].filter(([, p]) => p.length > 1).length,
    generatedAt: chart.generatedAt,
    roster: `${chart.rosterCount}/${chart.rosterLimit}`,
    manualReview: chart.manualReview?.length ?? 0,
    rendered,
    classifications: rendered.map((r) => ({
      ...r,
      sourceClass: classifySourceRelation(activeIds, depthSrc.roster ?? [], {
        card: r.card,
        mlbId: r.mlbId,
      }),
    })),
    sp: rendered.filter((r) => r.card === "SP"),
    rp: rendered.filter((r) => r.card === "RP"),
  };
}

async function main() {
  const catalog = (await fetchJson<{ players: Player[] }>(
    `${API_BASE}/api/players?sort=catalog_rank&posEligibilityThreshold=20`,
  )).players;

  const summaries = [];
  const nyy = await auditTeam(TEAMS[0], catalog);
  const mia = await auditTeam(TEAMS[1], catalog);
  summaries.push(nyy, mia);

  for (const t of TEAMS.slice(2)) {
    summaries.push(await auditTeam(t, catalog));
  }

  console.log("=== Multi-team summary ===");
  console.table(
    summaries.map((s) => ({
      Team: s.team,
      Active: s.activeRoster,
      "MLB depth feed rows": s.mlbDepthRows,
      Rendered: s.rendered,
      "Multi-card": s.multiCardPlayers,
      "Multi-source": s.multiSourceListings,
      Roster: s.roster,
      Generated: s.generatedAt?.slice(0, 19),
    })),
  );

  function printSamples(team: typeof nyy, names: string[]) {
    console.log(`\n=== ${team.team} named samples (catalog auction on board) ===`);
    console.table(
      names.map((name) => {
        const rows = team.classifications.filter((r) => r.name === name);
        if (!rows.length) return { name, note: "not on depth chart" };
        return {
          name,
          cards: rows.map((r) => `${r.card}#${r.rank}`).join(", "),
          state: [...new Set(rows.map((r) => r.state))].join("/"),
          right: [...new Set(rows.map((r) => r.right))].join(" | "),
          source: [...new Set(rows.map((r) => r.sourceClass.split(" —")[0]))].join(", "),
        };
      }),
    );
  }

  printSamples(nyy, NYY_SAMPLES);
  printSamples(mia, MIA_SAMPLES);

  console.log("\n=== NYY source classification counts ===");
  const nyyCounts: Record<string, number> = {};
  for (const r of nyy.classifications) {
    const k = r.sourceClass.split(" —")[0] ?? r.sourceClass;
    nyyCounts[k] = (nyyCounts[k] ?? 0) + 1;
  }
  console.table(nyyCounts);

  console.log("\n=== MIA SP/RP ===");
  console.table([
    ...mia.sp.map((r) => ({ role: "SP", ...r })),
    ...mia.rp.map((r) => ({ role: "RP", ...r })),
  ]);

  console.log("\n=== Badge accuracy (all teams, catalog auction as proxy board) ===");
  let exact = 0,
    catalogOnly = 0,
    depthOnly = 0,
    valued = 0;
  for (const s of summaries) {
    for (const r of s.rendered) {
      if (r.match !== "exact_mlb_id") continue;
      exact++;
      if (r.state === "catalog_only" && r.right.startsWith("$")) valued++;
      else if (r.state === "catalog_only") catalogOnly++;
      else if (r.state === "depth_only") depthOnly++;
    }
  }
  console.log({ exactMlbMatches: exact, showsAuctionWhenCatalogHasValue: valued, catalogOnlyNoDisplay: catalogOnly, depthOnly });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
