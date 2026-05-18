/**
 * Multi-state valuation verification (true empty, Original demo, keeper demo, picks, checkpoints).
 *
 *   cd apps/api && pnpm exec tsx scripts/verify-economic-states.ts
 *   AMETHYST_API_URL=http://localhost:3099 pnpm exec tsx scripts/verify-economic-states.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import League from "../src/models/League";
import RosterEntry from "../src/models/RosterEntry";
import type { IRosterEntry } from "../src/models/RosterEntry";
import type { ILeague } from "../src/models/League";
import {
  buildValuationContext,
  finalizeEngineValuationPostPayload,
  valuationIncomingToEngineContext,
} from "../src/lib/engineContext";
import { resolveAuctionCurveModelForDraftRequest } from "../src/lib/auctionCurveModel";
import { amethyst, resolveAmethystEngineBaseUrl } from "../src/lib/amethyst";
import {
  readCheckpointFixtureJson,
  type EngineCheckpointId,
} from "../src/lib/engineCheckpointCatalog";
import { valuationIncomingSchema } from "../src/validation/schemas";
import { shapeValuationResponseForDraft } from "../src/lib/draftValuationContract";
import { getOrRefreshCatalogPlayers } from "../src/lib/catalogPlayerFetch";
import {
  buildCanonicalPlayerIdByNormName,
  buildCatalogIdByNormName,
} from "../src/lib/valuationRowLookup";
import {
  resolveDemoKeeperPreDraftLeague,
  resolveFriendlyLeagueForAudit,
  resolveOriginalDemoLeague,
} from "../src/lib/canonicalAuditLeagues";

const TRACKED = [
  "Tarik Skubal",
  "Aaron Judge",
  "Bryan Woo",
  "Bobby Witt Jr.",
  "Shohei Ohtani",
];

type PickRow = {
  player_id: string;
  name: string;
  positions?: string[];
  team?: string;
  team_id: string;
  paid?: number;
  pick_number?: number;
  roster_slot?: string;
};

type StateRow = {
  state_id: string;
  league_label: string;
  picks: number;
  opening_board_calibration: string | null;
  pre_draft_sections: number;
  synthetic_budget: boolean;
  player_ids: number;
  position_overrides: number;
  injury_overrides: number;
  pool: number;
  remaining_slots: number;
  inflation_factor: number | null;
  auction_curve_reason: string | null;
  max_auction: number | null;
  top1: string | null;
  util_replacement: number | null;
  tier_counts: Record<string, number>;
  tracked: Record<string, string | number>;
  first_pick_in_pool: boolean | null;
  research_cc_auction_match: boolean;
  pass: boolean;
  notes: string[];
};

function displayTier(av: number): number {
  if (!Number.isFinite(av) || av < 1) return 5;
  if (av >= 25) return 1;
  if (av >= 15) return 2;
  if (av >= 10) return 3;
  if (av >= 5) return 4;
  return 5;
}

function normName(n: string): string {
  return n
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function utilReplacement(resp: Record<string, unknown>): number | null {
  const m = resp.replacement_values_by_slot_or_position as
    | Record<string, number>
    | undefined;
  if (!m) return null;
  const v = m.UTIL ?? m.util;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function picksToRosterEntries(
  leagueId: mongoose.Types.ObjectId,
  picks: PickRow[],
): IRosterEntry[] {
  const oid = new mongoose.Types.ObjectId();
  return picks.map(
    (p, i) =>
      ({
        _id: new mongoose.Types.ObjectId(),
        leagueId,
        userId: oid,
        teamId: p.team_id,
        externalPlayerId: p.player_id,
        playerName: p.name,
        playerTeam: p.team ?? "",
        positions: p.positions ?? [],
        price: p.paid ?? 0,
        rosterSlot: p.roster_slot ?? p.positions?.[0] ?? "UTIL",
        isKeeper: false,
        acquiredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as IRosterEntry,
  );
}

async function postEngine(payload: Record<string, unknown>) {
  const { data } = await amethyst.post("/valuation/calculate", payload);
  return data as Record<string, unknown>;
}

async function evaluateLeagueState(params: {
  state_id: string;
  league_label: string;
  league: ILeague;
  entries: IRosterEntry[];
  picks: number;
  expect: {
    calibration?: "stage3b_demo_v1" | null;
    min_pool?: number;
    max_pool?: number;
    min_max_auction?: number;
    max_max_auction?: number;
    curve_includes?: string;
    curve_excludes?: string;
    min_t1?: number;
    woo_max?: number;
    woo_min?: number;
    skubal_min?: number;
    util_near?: number;
    util_tol?: number;
    distinct_from_demo?: boolean;
  };
  firstPickPlayerId?: string;
  catalogIdByNorm?: ReadonlyMap<string, string>;
}): Promise<StateRow> {
  const catalogIdByNorm = params.catalogIdByNorm ?? new Map<string, string>();
  const ctx = await buildValuationContext(
    params.league,
    params.entries,
    {
      userTeamId: "team_1",
      auctionCurveModel: resolveAuctionCurveModelForDraftRequest({}),
    },
  );
  const payload = finalizeEngineValuationPostPayload(ctx) as Record<
    string,
    unknown
  >;
  const raw = await postEngine(payload);
  const shaped = shapeValuationResponseForDraft(raw, {});

  const draftable = new Set(
    ((raw.draftable_player_ids as string[]) ?? []).map(String),
  );
  const vals = (raw.valuations ?? []) as Array<{
    name?: string;
    player_id?: string;
    auction_value?: number;
  }>;
  const idByNorm = buildCanonicalPlayerIdByNormName(vals, draftable, catalogIdByNorm);
  const sorted = vals
    .filter((v) => v.player_id && draftable.has(String(v.player_id)))
    .sort((a, b) => (b.auction_value ?? 0) - (a.auction_value ?? 0));

  const tier_counts = { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };
  for (const r of sorted) {
    const av = r.auction_value;
    if (typeof av !== "number") continue;
    const t = displayTier(av);
    tier_counts[`T${t}` as keyof typeof tier_counts]++;
  }

  const tracked: Record<string, string | number> = {};
  for (const n of TRACKED) {
    const pid = idByNorm.get(normName(n));
    const row = vals.find((v) => String(v.player_id) === pid);
    if (!row) tracked[n] = "missing";
    else if (!draftable.has(String(row.player_id)))
      tracked[n] = "keeper/non-draftable";
    else tracked[n] = Math.round((row.auction_value ?? 0) * 100) / 100;
  }

  const budgetSynthetic =
    Boolean(payload.opening_board_calibration) &&
    params.entries.length === 0;

  const firstPickInPool =
    params.firstPickPlayerId != null
      ? draftable.has(params.firstPickPlayerId)
      : null;

  const researchCcMatch = (() => {
    for (const n of TRACKED.slice(0, 3)) {
      const pid = idByNorm.get(normName(n));
      if (!pid || !draftable.has(pid)) continue;
      const rawRow = vals.find((v) => String(v.player_id) === pid);
      const shRow = (shaped.valuations ?? []).find(
        (v: { player_id?: string }) => String(v.player_id) === pid,
      );
      if (!rawRow || !shRow) continue;
      if (
        Math.round(rawRow.auction_value ?? 0) !==
        Math.round((shRow as { auction_value?: number }).auction_value ?? 0)
      ) {
        return false;
      }
    }
    return true;
  })();

  const notes: string[] = [];
  let pass = true;
  const e = params.expect;

  const cal = (payload.opening_board_calibration as string) ?? null;
  if (e.calibration !== undefined && cal !== e.calibration) {
    pass = false;
    notes.push(`calibration expected ${e.calibration} got ${cal}`);
  }
  if (e.min_pool != null && draftable.size < e.min_pool) {
    pass = false;
    notes.push(`pool ${draftable.size} < min ${e.min_pool}`);
  }
  if (e.max_pool != null && draftable.size > e.max_pool) {
    pass = false;
    notes.push(`pool ${draftable.size} > max ${e.max_pool}`);
  }
  const maxAv = sorted[0]?.auction_value ?? null;
  if (e.min_max_auction != null && (maxAv ?? 0) < e.min_max_auction) {
    pass = false;
    notes.push(`max_auction ${maxAv} < min ${e.min_max_auction}`);
  }
  if (e.max_max_auction != null && (maxAv ?? 999) > e.max_max_auction) {
    pass = false;
    notes.push(`max_auction ${maxAv} > max ${e.max_max_auction}`);
  }
  const reason = String(raw.auction_curve_reason ?? "");
  if (e.curve_includes && !reason.includes(e.curve_includes)) {
    pass = false;
    notes.push(`curve missing ${e.curve_includes}: ${reason}`);
  }
  if (e.curve_excludes && reason.includes(e.curve_excludes)) {
    pass = false;
    notes.push(`curve should not include ${e.curve_excludes}`);
  }
  if (e.min_t1 != null && tier_counts.T1 < e.min_t1) {
    pass = false;
    notes.push(`T1 ${tier_counts.T1} < min ${e.min_t1}`);
  }
  const woo = tracked["Bryan Woo"];
  if (typeof woo === "number") {
    if (e.woo_max != null && woo > e.woo_max) {
      pass = false;
      notes.push(`Woo ${woo} > max ${e.woo_max}`);
    }
    if (e.woo_min != null && woo < e.woo_min) {
      pass = false;
      notes.push(`Woo ${woo} < min ${e.woo_min}`);
    }
  }
  const skubal = tracked["Tarik Skubal"];
  if (typeof skubal === "number" && e.skubal_min != null && skubal < e.skubal_min) {
    pass = false;
    notes.push(`Skubal ${skubal} < min ${e.skubal_min}`);
  }
  const util = utilReplacement(raw);
  if (e.util_near != null && util != null) {
    const tol = e.util_tol ?? 2;
    if (Math.abs(util - e.util_near) > tol) {
      pass = false;
      notes.push(`UTIL ${util} not near ${e.util_near} (±${tol})`);
    }
  }
  if (params.firstPickPlayerId && firstPickInPool === true) {
    pass = false;
    notes.push("first drafted player still in draftable pool");
  }

  return {
    state_id: params.state_id,
    league_label: params.league_label,
    picks: params.picks,
    opening_board_calibration: cal,
    pre_draft_sections: Array.isArray(payload.pre_draft_rosters)
      ? payload.pre_draft_rosters.length
      : 0,
    synthetic_budget: budgetSynthetic,
    player_ids: Array.isArray(payload.player_ids)
      ? payload.player_ids.length
      : 0,
    position_overrides: Array.isArray(payload.position_overrides)
      ? payload.position_overrides.length
      : 0,
    injury_overrides: Array.isArray(payload.injury_overrides)
      ? payload.injury_overrides.length
      : 0,
    pool: draftable.size,
    remaining_slots: Number(raw.remaining_slots ?? 0),
    inflation_factor:
      typeof raw.inflation_factor === "number" ? raw.inflation_factor : null,
    auction_curve_reason: reason || null,
    max_auction: maxAv,
    top1: sorted[0]?.name ?? null,
    util_replacement: util,
    tier_counts,
    tracked,
    first_pick_in_pool: firstPickInPool,
    research_cc_auction_match: researchCcMatch,
    pass,
    notes,
  };
}

async function evaluatePayloadState(params: {
  state_id: string;
  league_label: string;
  payload: Record<string, unknown>;
  picks: number;
  expect: Parameters<typeof evaluateLeagueState>[0]["expect"];
  firstPickPlayerId?: string;
  catalogIdByNorm?: ReadonlyMap<string, string>;
}): Promise<StateRow> {
  const catalogIdByNorm = params.catalogIdByNorm ?? new Map<string, string>();
  const raw = await postEngine(params.payload);
  const shaped = shapeValuationResponseForDraft(raw, {});
  const draftable = new Set(
    ((raw.draftable_player_ids as string[]) ?? []).map(String),
  );
  const vals = (raw.valuations ?? []) as Array<{
    name?: string;
    player_id?: string;
    auction_value?: number;
  }>;
  const idByNorm = buildCanonicalPlayerIdByNormName(vals, draftable, catalogIdByNorm);
  const sorted = vals
    .filter((v) => v.player_id && draftable.has(String(v.player_id)))
    .sort((a, b) => (b.auction_value ?? 0) - (a.auction_value ?? 0));

  const tier_counts = { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };
  for (const r of sorted) {
    const av = r.auction_value;
    if (typeof av !== "number") continue;
    tier_counts[`T${displayTier(av)}` as keyof typeof tier_counts]++;
  }

  const tracked: Record<string, string | number> = {};
  for (const n of TRACKED) {
    const pid = idByNorm.get(normName(n));
    const row = vals.find((v) => String(v.player_id) === pid);
    if (!row) tracked[n] = "missing";
    else if (!draftable.has(String(row.player_id)))
      tracked[n] = "keeper/non-draftable";
    else tracked[n] = Math.round((row.auction_value ?? 0) * 100) / 100;
  }

  const firstPickInPool =
    params.firstPickPlayerId != null
      ? draftable.has(params.firstPickPlayerId)
      : null;

  const row: StateRow = {
    state_id: params.state_id,
    league_label: params.league_label,
    picks: params.picks,
    opening_board_calibration:
      (params.payload.opening_board_calibration as string) ?? null,
    pre_draft_sections: Array.isArray(params.payload.pre_draft_rosters)
      ? params.payload.pre_draft_rosters.length
      : 0,
    synthetic_budget: false,
    player_ids: Array.isArray(params.payload.player_ids)
      ? params.payload.player_ids.length
      : 0,
    position_overrides: Array.isArray(params.payload.position_overrides)
      ? params.payload.position_overrides.length
      : 0,
    injury_overrides: Array.isArray(params.payload.injury_overrides)
      ? params.payload.injury_overrides.length
      : 0,
    pool: draftable.size,
    remaining_slots: Number(raw.remaining_slots ?? 0),
    inflation_factor:
      typeof raw.inflation_factor === "number" ? raw.inflation_factor : null,
    auction_curve_reason: String(raw.auction_curve_reason ?? "") || null,
    max_auction: sorted[0]?.auction_value ?? null,
    top1: sorted[0]?.name ?? null,
    util_replacement: utilReplacement(raw),
    tier_counts,
    tracked,
    first_pick_in_pool: firstPickInPool,
    research_cc_auction_match: true,
    pass: true,
    notes: [],
  };

  const e = params.expect;
  if (e.calibration !== undefined && row.opening_board_calibration !== e.calibration) {
    row.pass = false;
    row.notes.push(`calibration expected ${e.calibration}`);
  }
  if (e.min_pool != null && row.pool < e.min_pool) {
    row.pass = false;
    row.notes.push(`pool ${row.pool} < ${e.min_pool}`);
  }
  if (e.max_pool != null && row.pool > e.max_pool) {
    row.pass = false;
    row.notes.push(`pool ${row.pool} > ${e.max_pool}`);
  }
  if (e.min_max_auction != null && (row.max_auction ?? 0) < e.min_max_auction) {
    row.pass = false;
    row.notes.push(`max ${row.max_auction} < ${e.min_max_auction}`);
  }
  if (e.max_max_auction != null && (row.max_auction ?? 999) > e.max_max_auction) {
    row.pass = false;
    row.notes.push(`max ${row.max_auction} > ${e.max_max_auction}`);
  }
  if (e.curve_includes && !String(row.auction_curve_reason).includes(e.curve_includes)) {
    row.pass = false;
    row.notes.push(`curve missing ${e.curve_includes}`);
  }
  if (e.min_t1 != null && row.tier_counts.T1 < e.min_t1) {
    row.pass = false;
    row.notes.push(`T1 ${row.tier_counts.T1} < ${e.min_t1}`);
  }
  const woo = row.tracked["Bryan Woo"];
  if (typeof woo === "number" && e.woo_max != null && woo > e.woo_max) {
    row.pass = false;
    row.notes.push(`Woo ${woo} > ${e.woo_max}`);
  }
  const skubal = row.tracked["Tarik Skubal"];
  if (typeof skubal === "number" && e.skubal_min != null && skubal < e.skubal_min) {
    row.pass = false;
    row.notes.push(`Skubal ${skubal} < ${e.skubal_min}`);
  }
  if (row.util_replacement != null && e.util_near != null) {
    const tol = e.util_tol ?? 3;
    if (Math.abs(row.util_replacement - e.util_near) > tol) {
      row.pass = false;
      row.notes.push(`UTIL ${row.util_replacement} not near ${e.util_near}`);
    }
  }
  if (firstPickInPool === true) {
    row.pass = false;
    row.notes.push("first pick still draftable");
  }
  void shaped;
  return row;
}

async function checkpointRow(
  id: EngineCheckpointId,
  catalogIdByNorm: ReadonlyMap<string, string>,
): Promise<StateRow> {
  const cp = readCheckpointFixtureJson(id);
  const parsed = valuationIncomingSchema.parse(cp);
  const ctx = valuationIncomingToEngineContext(parsed);
  const payload = finalizeEngineValuationPostPayload({
    ...ctx,
    user_team_id: "team_1",
    auction_curve_model: resolveAuctionCurveModelForDraftRequest({}),
    deterministic: true,
    seed: 42,
  }) as Record<string, unknown>;
  const picks = (cp.draft_state as PickRow[]) ?? [];

  return evaluatePayloadState({
    state_id: `checkpoint_${id}`,
    league_label: `[fixture] ${id}`,
    payload,
    picks: picks.length,
    expect: {
      calibration: null,
      ...(id === "pre_draft"
        ? {
            min_pool: 110,
            max_pool: 116,
            min_max_auction: 30,
            min_t1: 8,
            woo_max: 12,
            skubal_min: 30,
            util_near: 56.6,
            util_tol: 3,
          }
        : id === "after_pick_50"
          ? { max_max_auction: 22 }
          : id === "after_pick_100"
            ? { max_max_auction: 18 }
            : {}),
    },
    catalogIdByNorm,
  });
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI required");

  await mongoose.connect(uri);

  const catalog = await getOrRefreshCatalogPlayers(20);
  const catalogIdByNorm = buildCatalogIdByNormName(catalog);

  const original = await resolveOriginalDemoLeague();
  const friendly = await resolveFriendlyLeagueForAudit();
  const demoPre = await resolveDemoKeeperPreDraftLeague();

  if (!original || !friendly || !demoPre) {
    throw new Error("Missing Original, Friendly League, or [Demo] pre draft in Mongo");
  }

  const progressionPicks = (
    readCheckpointFixtureJson("after_pick_50").draft_state as PickRow[]
  ).slice(0, 25);

  const rows: StateRow[] = [];

  rows.push(
    await evaluateLeagueState({
      state_id: "true_empty_non_original",
      league_label: String(friendly.name),
      league: friendly as ILeague,
      entries: [],
      picks: 0,
      expect: {
        calibration: null,
        min_pool: 150,
        curve_includes: "fresh_empty_opening_tiered",
        min_max_auction: 28,
        max_max_auction: 36,
        min_t1: 4,
        curve_excludes: "keeper_compressed",
        woo_max: 28,
      },
      catalogIdByNorm,
    }),
  );

  rows.push(
    await evaluateLeagueState({
      state_id: "original_demo_empty",
      league_label: String(original.name),
      league: original as ILeague,
      entries: [],
      picks: 0,
      expect: {
        calibration: "stage3b_demo_v1",
        min_pool: 110,
        max_pool: 116,
        min_max_auction: 28,
        min_t1: 5,
        curve_includes: "keeper_compressed",
      },
      catalogIdByNorm,
    }),
  );

  rows.push(
    await evaluateLeagueState({
      state_id: "keeper_demo_pre_draft",
      league_label: String(demoPre.name),
      league: demoPre as ILeague,
      entries: (await RosterEntry.find({
        leagueId: demoPre._id,
      }).lean()) as IRosterEntry[],
      picks: 0,
      expect: {
        calibration: null,
        min_pool: 110,
        max_pool: 116,
        min_max_auction: 30,
        woo_max: 12,
        skubal_min: 30,
        util_near: 56.6,
        util_tol: 3,
      },
      catalogIdByNorm,
    }),
  );

  const pickCounts = [0, 1, 5, 10, 25];
  for (const n of pickCounts) {
    const slice = progressionPicks.slice(0, n);
    const firstId = slice[0]?.player_id;
    rows.push(
      await evaluateLeagueState({
        state_id: `original_picks_${n}`,
        league_label: "Original",
        league: original as ILeague,
        entries: picksToRosterEntries(
          original._id as mongoose.Types.ObjectId,
          slice,
        ),
        picks: n,
        firstPickPlayerId: n > 0 ? firstId : undefined,
        expect:
          n === 0
            ? { calibration: "stage3b_demo_v1", min_max_auction: 28 }
            : { calibration: null, max_max_auction: 35 },
        catalogIdByNorm,
      }),
    );
    rows.push(
      await evaluateLeagueState({
        state_id: `friendly_empty_picks_${n}`,
        league_label: "Friendly League",
        league: friendly as ILeague,
        entries: picksToRosterEntries(
          friendly._id as mongoose.Types.ObjectId,
          slice,
        ),
        picks: n,
        firstPickPlayerId: n > 0 ? firstId : undefined,
        expect: {
          calibration: null,
          ...(n === 0
            ? {
                min_max_auction: 28,
                max_max_auction: 36,
                min_t1: 4,
                curve_includes: "fresh_empty_opening_tiered",
              }
            : { max_max_auction: 40 }),
        },
        catalogIdByNorm,
      }),
    );
  }

  for (const ck of [
    "pre_draft",
    "after_pick_10",
    "after_pick_50",
    "after_pick_100",
    "after_pick_130",
  ] as EngineCheckpointId[]) {
    rows.push(await checkpointRow(ck, catalogIdByNorm));
  }

  const distinctEmpty =
    rows.find((r) => r.state_id === "true_empty_non_original")!.max_auction !==
    rows.find((r) => r.state_id === "original_demo_empty")!.max_auction;

  const report = {
    engine: resolveAmethystEngineBaseUrl(),
    at: new Date().toISOString(),
    true_empty_vs_original_distinct: distinctEmpty,
    summary: {
      total: rows.length,
      passed: rows.filter((r) => r.pass).length,
      failed: rows.filter((r) => !r.pass).length,
    },
    rows,
  };

  console.log(JSON.stringify(report, null, 2));

  await mongoose.disconnect();

  if (report.summary.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
