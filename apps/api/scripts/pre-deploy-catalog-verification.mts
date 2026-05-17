/**
 * Pre-deploy verification: catalog coverage, depth charts, valuation impact (Draftroom path).
 *
 *   cd apps/api && pnpm run build && pnpm exec tsx scripts/pre-deploy-catalog-verification.mts
 *
 * Requires: AMETHYST_API_URL, AMETHYST_API_KEY, network for MLB + Engine.
 * Optional: API_BASE for depth-chart route (default http://127.0.0.1:3000) — skips if unreachable.
 */
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEngineValuationCalculateBodyFromFixture,
  finalizeEngineValuationPostPayload,
  playerDataToInjuryOverrides,
  playerDataToPositionOverrides,
} from "../dist/lib/engineContext.js";
import { getOrRefreshCatalogPlayers } from "../dist/lib/catalogPlayerFetch.js";
import { amethyst } from "../dist/lib/amethyst.js";
import {
  ENGINE_CHECKPOINT_IDS,
  readCheckpointFixtureJson,
  type EngineCheckpointId,
} from "../dist/lib/engineCheckpointCatalog.js";
import { valuationIncomingSchema } from "../dist/validation/valuationRequestSchema.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dir, "../../tmp");
const OUT = join(OUT_DIR, "pre-deploy-catalog-verification.json");

const RECOVERY = [
  { mlbId: 683011, name: "Anthony Volpe" },
  { mlbId: 669224, name: "Austin Wells" },
  { mlbId: 701542, name: "Will Warren" },
  { mlbId: 666808, name: "Camilo Doval" },
  { mlbId: 518585, name: "Fernando Cruz" },
  { mlbId: 682987, name: "Spencer Jones" },
];

const DEEP_DIVE_NAMES = [
  "Aaron Judge",
  "Julio Rodríguez",
  "Julio Rodriguez",
  "Bobby Witt Jr.",
  "José Ramírez",
  "Jose Ramirez",
  "Vladimir Guerrero Jr.",
  "Gunnar Henderson",
  "Cal Raleigh",
  "Anthony Volpe",
  "Austin Wells",
  "Will Warren",
  "Camilo Doval",
  "Fernando Cruz",
  "Spencer Jones",
];

const TEAMS = [
  { id: 147, abbr: "NYY" },
  { id: 111, abbr: "BOS" },
  { id: 136, abbr: "SEA" },
  { id: 118, abbr: "KC" },
  { id: 141, abbr: "TOR" },
];

const BASELINE_DOC = {
  catalog_total: 536,
  valuation_eligible: 536,
  catalog_only: 0,
  nyy_depth_only: 15,
  nyy_depth_rows: 32,
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function mergeCatalogIntoFixtureBody(
  body: ReturnType<typeof buildEngineValuationCalculateBodyFromFixture>,
  catalog: Awaited<ReturnType<typeof getOrRefreshCatalogPlayers>>,
) {
  const catalogForEngine = catalog.filter((p) => p.valuation_eligible);
  const preDraftIds: string[] = [];
  if (body.pre_draft_rosters && Array.isArray(body.pre_draft_rosters)) {
    for (const section of body.pre_draft_rosters) {
      for (const p of section.players) {
        preDraftIds.push(String(p.player_id).trim());
      }
    }
  }
  const draftedIds = new Set([
    ...body.drafted_players.map((d) => String(d.player_id).trim()),
    ...preDraftIds,
  ]);
  const valuationPlayerIds = catalogForEngine
    .map((p) => String(p.id).trim())
    .filter((id) => !draftedIds.has(id));

  return {
    ...body,
    position_overrides: playerDataToPositionOverrides(catalogForEngine),
    injury_overrides: playerDataToInjuryOverrides(catalogForEngine),
    player_ids: valuationPlayerIds,
    deterministic: true,
    seed: 42,
    explain_valuation_rows: true,
    inflation_model: "replacement_slots_v2" as const,
    auction_curve_model: "adaptive_surplus_v1" as const,
  };
}

function summaryStats(valuations: Record<string, unknown>[]) {
  const avs = valuations
    .map((v) => num(v.auction_value))
    .filter((x): x is number => x != null)
    .sort((a, b) => b - a);
  const top25 = avs.slice(0, 25);
  let largestAdjacentDropTop75 = 0;
  for (let i = 0; i < Math.min(74, avs.length - 1); i++) {
    largestAdjacentDropTop75 = Math.max(
      largestAdjacentDropTop75,
      avs[i]! - avs[i + 1]!,
    );
  }
  const plateau48 = avs.filter((v) => v === 48).length;
  const cliff15to5 = valuations.filter((v) => {
    const a = num(v.auction_value);
    return a != null && a >= 5 && a <= 15;
  }).length;

  return {
    top_25_auction_values: top25,
    count_above_40: avs.filter((v) => v > 40).length,
    count_above_30: avs.filter((v) => v > 30).length,
    count_above_20: avs.filter((v) => v > 20).length,
    count_above_10: avs.filter((v) => v > 10).length,
    count_min_bid: avs.filter((v) => v <= 1).length,
    largest_adjacent_drop_top_75: largestAdjacentDropTop75,
    plateau_48_count: plateau48,
    cliff_5_to_15_band_count: cliff15to5,
    endgame_above_20_count: avs.slice(75).filter((v) => v > 20).length,
  };
}

async function postValuation(payload: Record<string, unknown>) {
  const { data } = await amethyst.post("/valuation/calculate", payload);
  return data as Record<string, unknown>;
}

async function catalogVerification() {
  const catalog = await getOrRefreshCatalogPlayers(20);
  const byMlb = new Map(catalog.map((p) => [p.mlbId, p]));
  const mlbDupes = catalog.length - new Set(catalog.map((p) => p.mlbId)).size;
  const idDupes = catalog.length - new Set(catalog.map((p) => p.id)).size;

  const recovery = RECOVERY.map((r) => {
    const row = byMlb.get(r.mlbId);
    return {
      ...r,
      in_catalog: Boolean(row),
      valuation_eligible: row?.valuation_eligible ?? null,
      value: row?.value ?? null,
      catalog_kind: row?.catalog_kind ?? null,
    };
  });

  return {
    catalog_total: catalog.length,
    valuation_eligible_count: catalog.filter((p) => p.valuation_eligible).length,
    catalog_only_count: catalog.filter((p) => !p.valuation_eligible).length,
    duplicate_mlb_id_rows: mlbDupes,
    duplicate_id_rows: idDupes,
    recovery_players: recovery,
    catalog,
  };
}

async function depthChartsVerification(
  catalog: Awaited<ReturnType<typeof getOrRefreshCatalogPlayers>>,
) {
  const API_BASE = process.env.API_BASE?.trim() || "http://127.0.0.1:3000";
  const { buildDepthRowResolutionCache, resolveDepthRowMatch } = await import(
    "../../web/src/domain/depthChartRowMatch.ts"
  );
  const teamSummaries: Record<string, unknown>[] = [];
  let apiAvailable = true;

  for (const team of TEAMS) {
    try {
      const r = await fetch(`${API_BASE}/api/players/depth-chart/${team.id}`);
      if (!r.ok) throw new Error(String(r.status));
      const chart = (await r.json()) as {
        positions: Record<string, Array<{ playerId: number; playerName: string }>>;
      };
      const rows: Array<{
        playerId: number;
        playerName: string;
        chartPosition: string;
        teamAbbr: string;
      }> = [];
      for (const [pos, list] of Object.entries(chart.positions ?? {})) {
        for (const row of list) {
          rows.push({
            ...row,
            chartPosition: pos,
            teamAbbr: team.abbr,
          });
        }
      }
      const cache = buildDepthRowResolutionCache(
        rows,
        team.abbr,
        catalog as never[],
        null,
        null,
        new Map(),
      );
      let depthOnly = 0;
      let catalogOnly = 0;
      let valued = 0;
      let rostered = 0;
      let unmatched = 0;
      const examples: Record<string, string[]> = {
        depth_only: [],
        catalog_only: [],
        valued: [],
        rostered: [],
      };
      for (const row of rows) {
        const res = resolveDepthRowMatch(
          cache,
          row as never,
          row.chartPosition,
          team.abbr,
          [],
          [],
          [],
          new Map(),
        );
        if (res.state === "depth_only") depthOnly++;
        else if (res.state === "catalog_only") catalogOnly++;
        else if (res.state === "valued") valued++;
        else if (res.state === "rostered") rostered++;
        else unmatched++;
        const bucket = res.state as keyof typeof examples;
        if (examples[bucket] && examples[bucket].length < 4) {
          examples[bucket].push(row.playerName);
        }
      }
      teamSummaries.push({
        team: team.abbr,
        depth_rows: rows.length,
        depth_only: depthOnly,
        catalog_only: catalogOnly,
        valued,
        rostered,
        unmatched,
        examples,
      });
    } catch {
      apiAvailable = false;
      break;
    }
  }

  if (!apiAvailable) {
    const MLB = "https://statsapi.mlb.com/api/v1";
    const byMlb = new Map(catalog.map((p) => [p.mlbId, p]));
    for (const team of TEAMS) {
      const res = await fetch(
        `${MLB}/teams/${team.id}/roster?rosterType=depthChart&season=2026`,
      );
      const data = (await res.json()) as {
        roster?: Array<{ person?: { id?: number; fullName?: string } }>;
      };
      const ids = (data.roster ?? [])
        .map((e) => e.person?.id)
        .filter((x): x is number => typeof x === "number");
      const depthOnly = ids.filter((id) => !byMlb.has(id)).length;
      teamSummaries.push({
        team: team.abbr,
        depth_rows: ids.length,
        depth_only: depthOnly,
        catalog_match: ids.length - depthOnly,
        source: "mlb_depth_roster_vs_draft_catalog",
      });
    }
  }

  return { api_available: apiAvailable, teams: teamSummaries };
}

async function valuationImpact(
  catalog: Awaited<ReturnType<typeof getOrRefreshCatalogPlayers>>,
) {
  const checkpoints: EngineCheckpointId[] = [...ENGINE_CHECKPOINT_IDS];
  const results: Record<string, unknown> = {};

  for (const ck of checkpoints) {
    const raw = readCheckpointFixtureJson(ck);
    const parsed = valuationIncomingSchema.parse(raw);
    if (parsed.format !== "nested") {
      results[ck] = { error: "expected nested fixture" };
      continue;
    }
    const body = buildEngineValuationCalculateBodyFromFixture(parsed.data);
    const merged = mergeCatalogIntoFixtureBody(body, catalog);
    const payload = finalizeEngineValuationPostPayload(merged);
    const resp = await postValuation(payload);
    const valuations = (resp.valuations ?? []) as Record<string, unknown>[];
    const draftableIds = new Set(
      ((resp.draftable_player_ids ?? []) as string[]).map(String),
    );

    const playerRows: Record<string, unknown>[] = [];
    for (const name of DEEP_DIVE_NAMES) {
      const v = valuations.find((row) => {
        const n = str(row.name);
        return (
          n === name ||
          n.normalize("NFD").replace(/\p{M}/gu, "") ===
            name.normalize("NFD").replace(/\p{M}/gu, "")
        );
      });
      if (!v) continue;
      const ve = (v.valuation_explain ?? {}) as Record<string, unknown>;
      const cat = catalog.find((p) => String(p.id) === str(v.player_id));
      playerRows.push({
        name: str(v.name),
        player_id: str(v.player_id),
        in_catalog: Boolean(cat),
        catalog_valuation_eligible: cat?.valuation_eligible ?? null,
        auction_value: num(v.auction_value),
        surplus_basis: num(ve.surplus_basis),
        replacement_key_used: str(ve.replacement_key_used) || null,
        auction_tier: num(v.auction_tier),
        in_draftable_pool: draftableIds.has(str(v.player_id)),
        has_auction_value: num(v.auction_value) != null && num(v.auction_value)! > 0,
      });
    }

    results[ck] = {
      engine_meta: {
        draftable_pool_size: resp.draftable_pool_size,
        remaining_slots: resp.remaining_slots,
        inflation_factor: resp.inflation_factor,
        total_surplus_mass: resp.total_surplus_mass,
        surplus_cash: resp.surplus_cash,
        min_bid: resp.min_bid,
        valuations_returned: valuations.length,
        player_ids_sent: (payload.player_ids as string[] | undefined)?.length,
      },
      curve_summary: summaryStats(valuations),
      replacement_values_by_slot:
        resp.replacement_values_by_slot_or_position ?? null,
      deep_dive_players: playerRows,
    };
  }

  return results;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log("Loading Draftroom catalog (40-man union)…");
  const { catalog, ...catalogReport } = await catalogVerification();

  console.log("Depth charts…");
  const depth = await depthChartsVerification(catalog);

  console.log("Valuation checkpoints (Draftroom catalog → live Engine)…");
  const valuation = await valuationImpact(catalog);

  const preDraft = valuation.pre_draft as Record<string, unknown> | undefined;
  const report = {
    generated_at: new Date().toISOString(),
    baseline_documented: BASELINE_DOC,
    catalog: catalogReport,
    depth_charts: depth,
    valuation_by_checkpoint: valuation,
    engine_pool_semantics: {
      catalog_expanded: true,
      valuation_eligible_expanded_with_qualifying_stats: true,
      draftable_player_ids_engine_selected: true,
      catalog_only_no_auction_in_engine_response: !(
        (
          (valuation.pre_draft as {
            deep_dive_players?: { name: string; has_auction_value?: boolean }[];
          })?.deep_dive_players ?? []
        ).some((p) => p.name === "Spencer Jones" && p.has_auction_value)
      ),
      note:
        "Live Engine still loads Mongo catalog for inflation universe; Draftroom sends player_ids/position_overrides from getOrRefreshCatalogPlayers. Full production parity requires AmethystAPI sync-players roster-universe aligned with this catalog.",
    },
    deploy_recommendation: {
      catalog_and_depth_charts: "deploy_after_review",
      valuation_economics:
        "verify_pre_draft_top25_and_replacement_levels; expect shifts if Engine Mongo pool differs from Draft catalog player_ids_sent count",
      pre_draft_top25:
        (preDraft?.curve_summary as { top_25_auction_values?: number[] })
          ?.top_25_auction_values ?? null,
    },
  };

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log("Wrote", OUT);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
