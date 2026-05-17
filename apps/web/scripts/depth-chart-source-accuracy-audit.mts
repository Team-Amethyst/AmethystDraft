/**
 * Depth Charts source-vs-render accuracy audit (NYY, MIA).
 * Usage: pnpm exec tsx scripts/depth-chart-source-accuracy-audit.mts [API_BASE]
 */
import {
  buildDepthRowResolutionCache,
  resolveDepthRowMatch,
} from "../src/domain/depthChartRowMatch.ts";
import type { DepthChartPlayerRow, DepthChartResponse } from "../src/api/players.ts";
import type { Player } from "../src/types/player.ts";

const MLB_API = "https://statsapi.mlb.com/api/v1";
const API_BASE = process.argv[2]?.trim() || "http://127.0.0.1:3000";
const SEASON = new Date().getFullYear();

const TEAMS = [
  { id: 147, abbr: "NYY" },
  { id: 146, abbr: "MIA" },
] as const;

const DUPLICATE_CHECKS: Record<string, string[]> = {
  NYY: [
    "Aaron Judge",
    "Cody Bellinger",
    "Spencer Jones",
    "J.C. Escarra",
  ],
  MIA: [
    "Leo Jiménez",
    "Javier Sanoja",
    "Liam Hicks",
    "Kyle Stowers",
    "Connor Norby",
  ],
};

type MlbRosterEntry = {
  person?: { id?: number; fullName?: string };
  position?: { abbreviation?: string };
  status?: { code?: string; description?: string };
  parentTeamId?: number;
};

type SourceRow = {
  positionGroup: string;
  rank: number;
  playerName: string;
  mlbId: number;
  sourceStatus: string;
  sourceUsage: string;
  sourceTeam: string;
};

type RenderRow = {
  positionCard: string;
  rank: number;
  playerName: string;
  mlbId: number;
  statusBadge: string;
  fantasyState: string;
  catalogId: string;
};

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mapSourcePosToAppSlots(abbrev: string): string[] {
  const n = abbrev.toUpperCase();
  if (n === "P") return ["SP", "RP"];
  if (n === "CP") return ["RP"];
  if (n === "OF") return ["LF", "CF", "RF"];
  if (n === "UT" || n === "UTIL") return ["DH"];
  if (n === "TWP") return ["SP"];
  return [n];
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json() as Promise<T>;
}

function parseMlbDepthSource(
  roster: MlbRosterEntry[],
  teamAbbr: string,
): SourceRow[] {
  const counters = new Map<string, number>();
  const rows: SourceRow[] = [];

  for (const entry of roster) {
    const mlbId = entry.person?.id;
    const playerName = entry.person?.fullName;
    const pos = entry.position?.abbreviation?.toUpperCase();
    if (!mlbId || !playerName || !pos) continue;

    const rank = (counters.get(pos) ?? 0) + 1;
    counters.set(pos, rank);

    rows.push({
      positionGroup: pos,
      rank,
      playerName,
      mlbId,
      sourceStatus: entry.status?.description ?? entry.status?.code ?? "—",
      sourceUsage: "—",
      sourceTeam: teamAbbr,
    });
  }
  return rows;
}

function flattenRendered(
  chart: DepthChartResponse,
  teamAbbr: string,
  catalog: Player[],
): RenderRow[] {
  const out: RenderRow[] = [];
  for (const [positionCard, rows] of Object.entries(chart.positions)) {
    for (const row of rows) {
      const resolution = resolveDepthRowMatch(
        row as DepthChartPlayerRow,
        positionCard,
        teamAbbr,
        catalog,
        [],
        [],
        new Map(),
      );
      out.push({
        positionCard,
        rank: row.rank,
        playerName: row.playerName,
        mlbId: row.playerId,
        statusBadge: row.status,
        fantasyState: resolution.state,
        catalogId: resolution.catalogPlayerId ?? "—",
      });
    }
  }
  return out;
}

function pairKey(pos: string, mlbId: number): string {
  return `${pos}\t${mlbId}`;
}

function diagnoseDuplicate(
  name: string,
  sourceRows: SourceRow[],
  renderRows: RenderRow[],
): {
  name: string;
  sourcePositions: string[];
  renderPositions: string[];
  cause: string;
} {
  const norm = normalizeName(name);
  const src = sourceRows.filter((r) => normalizeName(r.playerName) === norm);
  const ren = renderRows.filter((r) => normalizeName(r.playerName) === norm);

  const sourcePositions = [...new Set(src.map((r) => `${r.positionGroup}#${r.rank}`))];
  const renderPositions = ren.map((r) => `${r.positionCard}#${r.rank}`);

  let cause: string;
  if (src.length === 0 && ren.length > 0) {
    cause = "render_only — not listed on MLB depthChart feed (algorithm/eligibility)";
  } else if (src.length > 1 && ren.length > 1) {
    const srcPosSet = new Set(src.map((r) => r.positionGroup));
    if (srcPosSet.size > 1) {
      cause = "present_in_MLB_depth_source (multi-position listings)";
    } else {
      cause = "source_repeat_same_column — unusual";
    }
  } else if (src.length === 1 && ren.length > 1) {
    cause =
      "app_multi_slot — single source listing expanded to multiple position cards by assignment logic";
  } else if (src.length > 1 && ren.length <= 1) {
    cause = "source_has_duplicates — render collapsed or picked one slot";
  } else if (ren.length <= 1) {
    cause = "single_placement — no duplicate issue";
  } else {
    cause = "unknown";
  }

  return { name, sourcePositions, renderPositions, cause };
}

function compareTeams(
  teamAbbr: string,
  sourceRows: SourceRow[],
  renderRows: RenderRow[],
): {
  exactMatches: number;
  missingFromRender: SourceRow[];
  extraInRender: RenderRow[];
  duplicatePlayers: Array<ReturnType<typeof diagnoseDuplicate>>;
  classification: string;
} {
  const renderByPlayerPos = new Map<string, RenderRow>();
  for (const r of renderRows) {
    renderByPlayerPos.set(pairKey(r.positionCard, r.mlbId), r);
  }

  const sourceSlotsMatchingRender: SourceRow[] = [];
  const missingFromRender: SourceRow[] = [];

  for (const s of sourceRows) {
    const appSlots = mapSourcePosToAppSlots(s.positionGroup);
    const hit = appSlots.some((slot) => renderByPlayerPos.has(pairKey(slot, s.mlbId)));
    if (hit) sourceSlotsMatchingRender.push(s);
    else if (s.rank <= 3) missingFromRender.push(s);
  }

  const sourcePlayerPos = new Set<string>();
  for (const s of sourceRows) {
    for (const slot of mapSourcePosToAppSlots(s.positionGroup)) {
      sourcePlayerPos.add(pairKey(slot, s.mlbId));
    }
  }

  const extraInRender = renderRows.filter(
    (r) => !sourcePlayerPos.has(pairKey(r.positionCard, r.mlbId)),
  );

  const renderDupes = new Map<number, string[]>();
  for (const r of renderRows) {
    const list = renderDupes.get(r.mlbId) ?? [];
    list.push(`${r.positionCard}#${r.rank}`);
    renderDupes.set(r.mlbId, list);
  }
  const multiRender = [...renderDupes.entries()].filter(([, ps]) => ps.length > 1);

  const duplicatePlayers = (DUPLICATE_CHECKS[teamAbbr] ?? []).map((name) =>
    diagnoseDuplicate(name, sourceRows, renderRows),
  );

  const sourceMulti = new Map<number, string[]>();
  for (const s of sourceRows) {
    const list = sourceMulti.get(s.mlbId) ?? [];
    list.push(`${s.positionGroup}#${s.rank}`);
    sourceMulti.set(s.mlbId, list);
  }
  const multiSource = [...sourceMulti.entries()].filter(([, ps]) => ps.length > 1);

  const extraOnlyAlgorithm = extraInRender.filter((r) => {
    const norm = normalizeName(r.playerName);
    return !sourceRows.some((s) => normalizeName(s.playerName) === norm);
  });

  let classification: string;
  const renderMultiFromSource = multiRender.filter(([id]) => (sourceMulti.get(id)?.length ?? 0) > 1);

  if (extraOnlyAlgorithm.length > renderRows.length * 0.15) {
    classification = "C — App bug: many rendered rows lack any source depth listing";
  } else if (multiRender.length > 0 && renderMultiFromSource.length === multiRender.length) {
    classification =
      "B — Mostly accurate: duplicates trace to MLB depthChart multi-position listings";
  } else if (multiRender.length > multiSource.length + 2) {
    classification =
      "C — App bug: UI adds multi-position duplicates beyond MLB depth source";
  } else if (missingFromRender.length > sourceRows.length * 0.4) {
    classification = "E — Stale/partial: many source top-3 rows absent from render";
  } else {
    classification =
      multiRender.length > multiSource.length
        ? "B/C — Mostly accurate with some algorithm-driven multi-slot assignments"
        : "A/B — Accurate: render aligns with source; any dupes are source-driven or expected algorithm slots";
  }

  return {
    exactMatches: sourceSlotsMatchingRender.length,
    missingFromRender: missingFromRender.slice(0, 25),
    extraInRender,
    duplicatePlayers,
    classification,
    multiRenderCount: multiRender.length,
    multiSourceCount: multiSource.length,
    renderMultiFromSource: renderMultiFromSource.length,
  } as ReturnType<typeof compareTeams> & {
    multiRenderCount: number;
    multiSourceCount: number;
    renderMultiFromSource: number;
  };
}

async function main() {
  console.log(`Depth chart source accuracy audit`);
  console.log(`Season: ${SEASON} | API: ${API_BASE}\n`);

  const catalogRaw = await fetchJson<{ players: Player[] }>(
    `${API_BASE}/api/players?sort=catalog_rank&posEligibilityThreshold=20`,
  );
  const catalog = catalogRaw.players;

  for (const team of TEAMS) {
    const mlbUrl = `${MLB_API}/teams/${team.id}/roster?rosterType=depthChart&season=${SEASON}`;
    const mlbData = await fetchJson<{ roster?: MlbRosterEntry[] }>(mlbUrl);
    const sourceRows = parseMlbDepthSource(mlbData.roster ?? [], team.abbr);

    const chart = await fetchJson<DepthChartResponse>(
      `${API_BASE}/api/players/depth-chart/${team.id}?refresh=1&season=${SEASON}`,
    );
    const renderRows = flattenRendered(chart, team.abbr, catalog);
    buildDepthRowResolutionCache(chart, team.abbr, catalog, [], [], new Map());

    const cmp = compareTeams(team.abbr, sourceRows, renderRows);

    console.log(`\n${"=".repeat(72)}`);
    console.log(`## ${team.abbr} (teamId ${team.id})`);
    console.log(`${"=".repeat(72)}`);
    console.log(`Source rows (MLB depthChart feed): ${sourceRows.length}`);
    console.log(`Rendered rows (API/UI): ${renderRows.length}`);
    console.log(`Roster: ${chart.rosterCount}/${chart.rosterLimit} | Generated: ${chart.generatedAt}`);

    console.log(`\n### 1. Raw depth source (first 40 rows)`);
    console.table(sourceRows.slice(0, 40));

    console.log(`\n### 2. Rendered UI rows`);
    console.table(renderRows);

    console.log(`\n### 3. Source-vs-render summary`);
    console.log(`  Source slots matched in render (by player+app position): ${cmp.exactMatches}`);
    console.log(`  Source top-3 rows not found on matching position card: ${cmp.missingFromRender.length}${cmp.missingFromRender.length >= 25 ? "+" : ""}`);
    console.log(`  Render rows with no source listing at that position: ${cmp.extraInRender.length}`);
    console.log(`  Players on multiple render cards: ${cmp.multiRenderCount}`);
    console.log(`  Players on multiple source listings: ${cmp.multiSourceCount}`);
    console.log(`  Multi-render dupes also multi-source: ${cmp.renderMultiFromSource}`);

    if (cmp.missingFromRender.length) {
      console.log(`\n  Missing from render (sample):`);
      console.table(
        cmp.missingFromRender.slice(0, 12).map((s) => ({
          Pos: s.positionGroup,
          Rank: s.rank,
          Name: s.playerName,
          MLB: s.mlbId,
        })),
      );
    }

    if (cmp.extraInRender.length) {
      console.log(`\n  Extra in render (not in source at that position):`);
      console.table(
        cmp.extraInRender.map((r) => ({
          Card: r.positionCard,
          Rank: r.rank,
          Name: r.playerName,
          MLB: r.mlbId,
          Badge: r.fantasyState,
        })),
      );
    }

    console.log(`\n### 4. Duplicate player diagnosis`);
    console.table(cmp.duplicatePlayers);

    console.log(`\n### 5. All multi-position render players`);
    const renderDupes = new Map<number, { name: string; positions: string[] }>();
    for (const r of renderRows) {
      const e = renderDupes.get(r.mlbId) ?? { name: r.playerName, positions: [] };
      e.positions.push(`${r.positionCard}#${r.rank}`);
      renderDupes.set(r.mlbId, e);
    }
    const multi = [...renderDupes.values()].filter((e) => e.positions.length > 1);
    console.table(
      multi.map((e) => ({
        Name: e.name,
        Render: e.positions.join(", "),
        InSource: diagnoseDuplicate(e.name, sourceRows, renderRows).sourcePositions.join(", ") || "—",
        Cause: diagnoseDuplicate(e.name, sourceRows, renderRows).cause,
      })),
    );

    console.log(`\n### 6. Accuracy: ${cmp.classification}`);
  }

  console.log(`\n--- Recommended action ---`);
  console.log(
    "If classification is A/B: no logic changes; optional UI copy that players may appear at multiple positions when listed in the MLB depth source or when filling starter/backup/reserve slots from the active roster.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
