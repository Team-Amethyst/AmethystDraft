/**
 * Tracked-player matrix across economic states (BFF → prod Engine).
 *
 *   cd apps/api && pnpm exec tsx scripts/tracked-player-matrix.ts
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
import { readCheckpointFixtureJson } from "../src/lib/engineCheckpointCatalog";
import { valuationIncomingSchema } from "../src/validation/schemas";
import { shapeValuationResponseForDraft } from "../src/lib/draftValuationContract";

const TRACKED_PLAYERS = [
  "Shohei Ohtani",
  "Tarik Skubal",
  "Aaron Judge",
  "Juan Soto",
  "Julio Rodríguez",
  "Fernando Tatis Jr.",
  "Bobby Witt Jr.",
  "José Ramírez",
  "Vladimir Guerrero Jr.",
  "Gunnar Henderson",
  "Cal Raleigh",
  "Bryan Woo",
  "Joe Ryan",
  "David Bednar",
  "Garrett Crochet",
  "Hunter Brown",
  "Drew Rasmussen",
  "Mason Miller",
  "Camilo Doval",
  "Will Warren",
  "Spencer Jones",
];

const ELITE_LAST_NAMES = new Set([
  "judge",
  "soto",
  "rodriguez",
  "witt",
  "ramirez",
  "guerrero",
  "henderson",
  "raleigh",
  "ohtani",
  "tatis",
]);

type PickRow = {
  player_id: string;
  name: string;
  positions?: string[];
  team?: string;
  team_id: string;
  paid?: number;
  pick_number?: number;
  roster_slot?: string;
  is_keeper?: boolean;
};

type ValRow = {
  player_id?: string;
  name?: string;
  auction_value?: number;
  auction_rank?: number;
  auction_tier?: number;
  recommended_bid?: number;
  team_value?: number;
  valuation_eligible?: boolean;
};

type PlayerCell = {
  name: string;
  in_valuations: boolean;
  auction_value_raw: number | null;
  displayed_dollar: string | null;
  auction_rank: number | null;
  user_tier: string | null;
  engine_auction_tier: number | null;
  draftable_pool: boolean;
  rostered_or_drafted: boolean;
  is_keeper: boolean;
  paid_price: number | null;
  suggested_bid_raw: number | null;
  suggested_bid_display: string | null;
  team_value_raw: number | null;
  team_value_display: string | null;
  research_cc_auction_match: boolean;
};

type StateResult = {
  state_id: string;
  label: string;
  picks: number;
  opening_board_calibration: string | null;
  pool_size: number;
  top1_name: string | null;
  top1_auction_raw: number | null;
  auction_curve_reason: string | null;
  t1_draftable_count: number;
  draft_picks_logged: Array<{
    name: string;
    player_id: string;
    paid: number;
    draftable_pool: boolean;
  }>;
  players: Record<string, PlayerCell>;
};

function normName(n: string): string {
  return n
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function displayTierFromRaw(raw: number, leagueBudget = 260): string {
  const scale = (ref: number) =>
    Math.max(1, Math.round((ref / 260) * leagueBudget));
  if (!Number.isFinite(raw) || raw < scale(1)) return "T5";
  if (raw >= scale(25)) return "T1";
  if (raw >= scale(15)) return "T2";
  if (raw >= scale(10)) return "T3";
  if (raw >= scale(5)) return "T4";
  return "T5";
}

function fmt$(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r < 0 ? `-$${Math.abs(r)}` : `$${r}`;
}

function picksToEntries(
  leagueId: mongoose.Types.ObjectId,
  picks: PickRow[],
): IRosterEntry[] {
  const oid = new mongoose.Types.ObjectId();
  return picks.map(
    (p) =>
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
        isKeeper: Boolean(p.is_keeper),
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

function rosteredSet(
  entries: IRosterEntry[],
  payload: Record<string, unknown>,
): Map<string, { paid: number; isKeeper: boolean }> {
  const m = new Map<string, { paid: number; isKeeper: boolean }>();
  for (const e of entries) {
    m.set(String(e.externalPlayerId), {
      paid: e.price ?? 0,
      isKeeper: Boolean(e.isKeeper),
    });
  }
  const drafted = (payload.drafted_players as Array<{ player_id?: string; paid?: number }>) ?? [];
  for (const d of drafted) {
    if (d.player_id) {
      m.set(String(d.player_id), {
        paid: d.paid ?? m.get(String(d.player_id))?.paid ?? 0,
        isKeeper: m.get(String(d.player_id))?.isKeeper ?? false,
      });
    }
  }
  return m;
}

function buildCells(
  stateId: string,
  rawResp: Record<string, unknown>,
  shapedResp: Record<string, unknown>,
  rostered: Map<string, { paid: number; isKeeper: boolean }>,
  leagueBudget: number,
): StateResult {
  const draftable = new Set(
    ((rawResp.draftable_player_ids as string[]) ?? []).map(String),
  );
  const rawVals = (rawResp.valuations ?? []) as ValRow[];
  const shapedVals = (shapedResp.valuations ?? []) as ValRow[];
  const shapedById = new Map(
    shapedVals.map((v) => [String(v.player_id), v]),
  );

  const byNorm = new Map<string, ValRow>();
  for (const v of rawVals) {
    if (v.name) byNorm.set(normName(v.name), v);
  }

  const sorted = rawVals
    .filter((v) => v.player_id && draftable.has(String(v.player_id)))
    .sort((a, b) => (b.auction_value ?? 0) - (a.auction_value ?? 0));
  const top = sorted[0];

  let t1 = 0;
  const players: Record<string, PlayerCell> = {};

  for (const name of TRACKED_PLAYERS) {
    const row = byNorm.get(normName(name));
    const pid = row?.player_id ? String(row.player_id) : null;
    const inVals = Boolean(row);
    const inPool = pid != null && draftable.has(pid);
    const ros = pid != null ? rostered.get(pid) : undefined;
    const av = typeof row?.auction_value === "number" ? row.auction_value : null;
    const userTier =
      av != null && inPool ? displayTierFromRaw(av, leagueBudget) : null;
    if (userTier === "T1" && inPool) t1++;

    const shaped = pid ? shapedById.get(pid) : undefined;
    const shapedAv =
      typeof shaped?.auction_value === "number" ? shaped.auction_value : null;
    const ccMatch =
      av == null ||
      shapedAv == null ||
      Math.round(av) === Math.round(shapedAv);

    players[name] = {
      name,
      in_valuations: inVals,
      auction_value_raw: av,
      displayed_dollar: av != null ? fmt$(av) : null,
      auction_rank:
        typeof row?.auction_rank === "number" ? row.auction_rank : null,
      user_tier: inPool ? userTier : ros ? "rostered" : inVals ? "out-of-pool" : null,
      engine_auction_tier:
        typeof row?.auction_tier === "number" ? row.auction_tier : null,
      draftable_pool: inPool,
      rostered_or_drafted: Boolean(ros),
      is_keeper: ros?.isKeeper ?? false,
      paid_price: ros?.paid ?? null,
      suggested_bid_raw:
        typeof row?.recommended_bid === "number" ? row.recommended_bid : null,
      suggested_bid_display: fmt$(row?.recommended_bid),
      team_value_raw: typeof row?.team_value === "number" ? row.team_value : null,
      team_value_display: fmt$(row?.team_value),
      research_cc_auction_match: ccMatch,
    };
  }

  return {
    state_id: stateId,
    label: stateId,
    picks: 0,
    opening_board_calibration:
      (rawResp.opening_board_calibration as string) ??
      null,
    pool_size: draftable.size,
    top1_name: top?.name ?? null,
    top1_auction_raw: top?.auction_value ?? null,
    auction_curve_reason: String(rawResp.auction_curve_reason ?? ""),
    t1_draftable_count: t1,
    draft_picks_logged: [],
    players,
  };
}

async function evaluateLeague(
  stateId: string,
  league: ILeague,
  entries: IRosterEntry[],
  picks: number,
): Promise<StateResult> {
  const ctx = await buildValuationContext(league, entries, {
    userTeamId: "team_1",
    auctionCurveModel: resolveAuctionCurveModelForDraftRequest({}),
  });
  const payload = finalizeEngineValuationPostPayload(ctx) as Record<
    string,
    unknown
  >;
  const raw = await postEngine(payload);
  raw.opening_board_calibration = ctx.opening_board_calibration ?? null;
  const shaped = shapeValuationResponseForDraft(raw, {});
  const ros = rosteredSet(entries, payload);
  const draftable = new Set(
    ((raw.draftable_player_ids as string[]) ?? []).map(String),
  );
  const draft_picks_logged = entries
    .filter((e) => !e.isKeeper)
    .map((e) => ({
      name: e.playerName,
      player_id: String(e.externalPlayerId),
      paid: e.price ?? 0,
      draftable_pool: draftable.has(String(e.externalPlayerId)),
    }));
  const result = buildCells(stateId, raw, shaped, ros, league.budget ?? 260);
  result.picks = picks;
  result.label = stateId;
  result.opening_board_calibration =
    (payload.opening_board_calibration as string) ?? null;
  result.draft_picks_logged = picks > 0 ? draft_picks_logged : [];
  return result;
}

async function evaluateCheckpoint(stateId: string, key: string): Promise<StateResult> {
  const cp = readCheckpointFixtureJson(key as "after_pick_50");
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
  const ros = new Map<string, { paid: number; isKeeper: boolean }>();
  for (const p of picks) {
    ros.set(String(p.player_id), {
      paid: p.paid ?? 0,
      isKeeper: Boolean(p.is_keeper),
    });
  }
  const raw = await postEngine(payload);
  const shaped = shapeValuationResponseForDraft(raw, {});
  const result = buildCells(stateId, raw, shaped, ros, parsed.total_budget);
  result.picks = picks.length;
  result.draft_picks_logged = picks.map((p) => ({
    name: p.name,
    player_id: String(p.player_id),
    paid: p.paid ?? 0,
    draftable_pool: new Set(
      ((raw.draftable_player_ids as string[]) ?? []).map(String),
    ).has(String(p.player_id)),
  }));
  return result;
}

function buildFlags(states: StateResult[]): string[] {
  const flags: string[] = [];

  const orig = states.find((s) => s.state_id === "original_calibrated_empty");
  if (orig) {
    if (orig.t1_draftable_count < 3) {
      flags.push(
        `original_calibrated_empty: T1 draftable count only ${orig.t1_draftable_count} (expected populated)`,
      );
    }
    const woo = orig.players["Bryan Woo"];
    if (woo?.auction_rank === 1 || orig.top1_name?.toLowerCase().includes("woo")) {
      flags.push(
        `original_calibrated_empty: Bryan Woo is #1 (rank ${woo?.auction_rank}) — demo preset pitcher ordering`,
      );
    }
    for (const [name, cell] of Object.entries(orig.players)) {
      if (!cell.research_cc_auction_match) {
        flags.push(`original_calibrated_empty: Research/CC mismatch on ${name}`);
      }
    }
    const jones = orig.players["Spencer Jones"];
    if (jones?.in_valuations) {
      flags.push("original_calibrated_empty: Spencer Jones has a valuation row");
    }
  }

  const empty = states.find((s) => s.state_id === "real_empty_non_original");
  if (empty && orig) {
    if (
      Math.abs((empty.top1_auction_raw ?? 0) - (orig.top1_auction_raw ?? 0)) < 2
    ) {
      flags.push(
        "true empty and Original demo tops are too close — may not be distinct",
      );
    }
    if (empty.opening_board_calibration) {
      flags.push("real_empty_non_original: unexpected opening_board_calibration");
    }
  }

  const demo = states.find((s) => s.state_id === "demo_keeper_pre_draft");
  if (demo) {
    const woo = demo.players["Bryan Woo"];
    if (woo?.auction_value_raw != null && woo.auction_value_raw > 15) {
      flags.push(
        `demo_keeper_pre_draft: Woo auction ${woo.auction_value_raw} (expected ~9)`,
      );
    }
    const skubal = demo.players["Tarik Skubal"];
    if (skubal?.auction_value_raw != null && skubal.auction_value_raw < 28) {
      flags.push(
        `demo_keeper_pre_draft: Skubal auction ${skubal.auction_value_raw} (expected ~32)`,
      );
    }
    const jones = demo.players["Spencer Jones"];
    if (jones?.in_valuations) {
      flags.push("demo_keeper_pre_draft: Spencer Jones has a valuation row");
    }
  }

  for (const s of states) {
    for (const [name, cell] of Object.entries(s.players)) {
      if (
        !cell.draftable_pool &&
        cell.in_valuations &&
        cell.auction_value_raw != null &&
        cell.auction_value_raw >= 10 &&
        !cell.rostered_or_drafted
      ) {
        flags.push(
          `${s.state_id}: ${name} has auction $${cell.auction_value_raw} but not in draftable pool (not rostered)`,
        );
      }
    }
  }

  for (const s of states) {
    for (const pick of s.draft_picks_logged ?? []) {
      if (pick.draftable_pool) {
        flags.push(
          `${s.state_id}: drafted ${pick.name} still in draftable pool`,
        );
      }
    }
  }

  return flags;
}

function printMarkdown(states: StateResult[], flags: string[]) {
  console.log("\n## Tracked-player matrix\n");
  console.log(`Engine: ${resolveAmethystEngineBaseUrl()}\n`);

  for (const s of states) {
    console.log(`### ${s.state_id}`);
    const picksNote =
      s.draft_picks_logged?.length > 0
        ? ` picks=[${s.draft_picks_logged.map((p) => `${p.name} $${p.paid} pool=${p.draftable_pool ? "Y" : "N"}`).join("; ")}]`
        : "";
    console.log(
      `pool=${s.pool_size} top1=${s.top1_name} ($${s.top1_auction_raw?.toFixed(2) ?? "—"}) curve=${s.auction_curve_reason} calibration=${s.opening_board_calibration ?? "null"} T1_draftable=${s.t1_draftable_count}${picksNote}\n`,
    );
    console.log(
      "| Player | raw | display | rank | user T | eng T | pool | roster | paid | sug bid | team val | CC=Res |",
    );
    console.log(
      "|--------|-----|---------|------|--------|-------|------|--------|------|---------|----------|--------|",
    );
    for (const name of TRACKED_PLAYERS) {
      const c = s.players[name];
      if (!c.in_valuations) {
        console.log(`| ${name} | — | — | — | — | — | — | — | — | — | — | — |`);
        continue;
      }
      console.log(
        `| ${name} | ${c.auction_value_raw?.toFixed(2) ?? "—"} | ${c.displayed_dollar ?? "—"} | ${c.auction_rank ?? "—"} | ${c.user_tier ?? "—"} | ${c.engine_auction_tier ?? "—"} | ${c.draftable_pool ? "Y" : "N"} | ${c.rostered_or_drafted ? (c.is_keeper ? "K" : "D") : "—"} | ${c.paid_price ?? "—"} | ${c.suggested_bid_display ?? "—"} | ${c.team_value_display ?? "—"} | ${c.research_cc_auction_match ? "Y" : "N"} |`,
      );
    }
    console.log("");
  }

  console.log("## Flags\n");
  if (flags.length === 0) console.log("_None_\n");
  else flags.forEach((f) => console.log(`- ${f}`));
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);
  const original = (await League.findOne({ name: /^original$/i }).lean()) as ILeague;
  const friendly = (await League.findById("69adf94bf906d9524b83f2df").lean()) as ILeague;
  const demoPre = (await League.findOne({
    name: /\[Demo\].*pre\s*draft/i,
  }).lean()) as ILeague;
  if (!original || !friendly || !demoPre) {
    throw new Error("Missing league rows in Mongo");
  }

  const fixturePicks = (
    readCheckpointFixtureJson("after_pick_50").draft_state as PickRow[]
  );
  const oid = original._id as mongoose.Types.ObjectId;

  const states: StateResult[] = [];

  states.push(
    await evaluateLeague(
      "original_calibrated_empty",
      original,
      [],
      0,
    ),
  );
  states.push(
    await evaluateLeague("real_empty_non_original", friendly, [], 0),
  );
  states.push(
    await evaluateLeague(
      "demo_keeper_pre_draft",
      demoPre,
      (await RosterEntry.find({ leagueId: demoPre._id }).lean()) as IRosterEntry[],
      0,
    ),
  );

  for (const n of [1, 5, 10]) {
    const slice = fixturePicks.slice(0, n);
    const entries = picksToEntries(oid, slice);
    const st = await evaluateLeague(
      `original_after_${n}_pick`,
      original,
      entries,
      n,
    );
    if (n >= 1 && slice[0]) {
      st.label = `${st.state_id} (drafted: ${slice[0].name} $${slice[0].paid ?? 0})`;
    }
    states.push(st);
  }

  states.push(
    await evaluateCheckpoint("checkpoint_after_pick_50", "after_pick_50"),
  );

  const flags = buildFlags(states);
  printMarkdown(states, flags);

  const out = {
    engine: resolveAmethystEngineBaseUrl(),
    at: new Date().toISOString(),
    states,
    flags,
  };
  console.log("\n--- JSON ---\n");
  console.log(JSON.stringify(out, null, 2));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
