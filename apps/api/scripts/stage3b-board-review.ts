/**
 * Stage 3b production-shaped board review (Research display simulation).
 * Uses live Engine HTTP + nested checkpoint fixtures (same as demo leagues).
 *
 *   cd apps/api && pnpm exec tsx scripts/stage3b-board-review.mts
 */
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENGINE_CHECKPOINT_IDS,
  readCheckpointFixtureJson,
  type EngineCheckpointId,
} from "../src/lib/engineCheckpointCatalog.js";
import { amethyst } from "../src/lib/amethyst";
import {
  buildEngineValuationCalculateBodyFromFixture,
  finalizeEngineValuationPostPayload,
} from "../src/lib/engineContext.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "../../tmp/stage3b-board-review.json");

const TRACKED = [
  "Aaron Judge",
  "Julio Rodríguez",
  "Bobby Witt Jr.",
  "José Ramírez",
  "Vladimir Guerrero Jr.",
  "Gunnar Henderson",
  "Cal Raleigh",
  "Anthony Volpe",
  "Tarik Skubal",
  "Bryan Woo",
  "Joe Ryan",
  "David Bednar",
  "Garrett Crochet",
  "Drew Rasmussen",
  "Mason Miller",
  "Camilo Doval",
  "Will Warren",
  "Spencer Jones",
];

function roundWhole(n: number): number {
  return Math.round(n);
}

function displayDollar(n: number): string {
  const r = roundWhole(n);
  const neg = r < 0;
  return `${neg ? "-" : ""}$${Math.abs(r)}`;
}

function normName(n: string): string {
  return n
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

type ValRow = {
  player_id?: string;
  name?: string;
  position?: string;
  auction_value?: number;
  auction_rank?: number;
  auction_tier?: number;
  valuation_explain?: {
    replacement_key_used?: string;
    surplus_basis?: number;
    auction_curve_tier?: string;
  };
};

async function fetchCheckpoint(cp: EngineCheckpointId) {
  const fixture = readCheckpointFixtureJson(cp);
  const body = finalizeEngineValuationPostPayload(
    buildEngineValuationCalculateBodyFromFixture(fixture),
  );
  const { data } = await amethyst.post("/valuation/calculate", body);
  return data as {
    valuations?: ValRow[];
    draftable_player_ids?: string[];
    replacement_values_by_slot_or_position?: Record<string, number>;
    surplus_cash?: number;
    context_v2?: { market_pressure?: unknown };
    curve_inputs?: { phase?: string };
    auction_curve_reason?: string;
  };
}

function topN(rows: ValRow[], ids: Set<string>, n: number, sort: "auction_value" | "auction_rank") {
  const draftable = rows.filter((r) => r.player_id && ids.has(r.player_id));
  const sorted =
    sort === "auction_rank"
      ? [...draftable].sort(
          (a, b) => (a.auction_rank ?? 999) - (b.auction_rank ?? 999),
        )
      : [...draftable].sort(
          (a, b) => (b.auction_value ?? 0) - (a.auction_value ?? 0),
        );
  return sorted.slice(0, n).map((r) => ({
    name: r.name,
    raw: r.auction_value,
    shown: displayDollar(r.auction_value ?? 0),
    rank: r.auction_rank,
    tier: r.auction_tier,
    slot: r.valuation_explain?.replacement_key_used,
    position: r.position,
  }));
}

function filterPosition(rows: ValRow[], ids: Set<string>, pos: string) {
  const p = pos.toUpperCase();
  return rows
    .filter((r) => r.player_id && ids.has(r.player_id))
    .filter((r) => {
      const slot = (r.valuation_explain?.replacement_key_used ?? r.position ?? "").toUpperCase();
      if (p === "SP" || p === "RP") return slot === p || (p === "SP" && slot === "P");
      if (p === "OF") return slot === "OF" || slot === "UTIL";
      return slot === p;
    })
    .sort((a, b) => (b.auction_value ?? 0) - (a.auction_value ?? 0))
    .slice(0, 8)
    .map((r) => ({
      name: r.name,
      raw: r.auction_value,
      shown: displayDollar(r.auction_value ?? 0),
    }));
}

function tierCounts(rows: ValRow[], ids: Set<string>) {
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (!r.player_id || !ids.has(r.player_id)) continue;
    const t = r.auction_tier ?? 5;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0] - b[0]));
}

async function main() {
  const pre = await fetchCheckpoint("pre_draft");
  const ap50 = await fetchCheckpoint("after_pick_50");
  const ids = new Set(pre.draftable_player_ids ?? []);
  const vals = pre.valuations ?? [];

  const tracked = TRACKED.map((name) => {
    const v = vals.find((x) => normName(x.name ?? "") === normName(name));
    if (!v) return { name, valuation_row: false };
    return {
      name: v.name,
      valuation_row: true,
      raw_auction: v.auction_value,
      ui_shown: displayDollar(v.auction_value ?? 0),
      auction_rank: v.auction_rank,
      auction_tier: v.auction_tier,
      explain_slot: v.valuation_explain?.replacement_key_used,
      surplus_basis: v.valuation_explain?.surplus_basis,
      in_draftable_pool: ids.has(v.player_id!),
    };
  });

  const issues: { area: string; type: string; detail: string }[] = [];

  if ((pre.draftable_player_ids?.length ?? 0) !== 113) {
    issues.push({
      area: "board",
      type: "model issue",
      detail: `pre_draft draftable pool ${pre.draftable_player_ids?.length} (expected 113)`,
    });
  }
  const util = pre.replacement_values_by_slot_or_position?.UTIL;
  if (util == null || util <= 50) {
    issues.push({
      area: "board",
      type: "model issue",
      detail: `UTIL replacement ${util}`,
    });
  }
  const spencer = tracked.find((t) => t.name === "Spencer Jones");
  if (spencer?.valuation_row) {
    issues.push({
      area: "catalog",
      type: "model issue",
      detail: "Spencer Jones has valuation row",
    });
  }

  const top50av = topN(vals, ids, 50, "auction_value");
  const plateau48 = top50av.filter(
    (r) => typeof r.raw === "number" && r.raw >= 47.5 && r.raw <= 48.5,
  ).length;
  if (plateau48 > 0) {
    issues.push({
      area: "board",
      type: "model issue",
      detail: `$48 plateau count ${plateau48}`,
    });
  }

  const ap50Ids = new Set(ap50.draftable_player_ids ?? []);
  const ap50Max = Math.max(
    0,
    ...(ap50.valuations ?? [])
      .filter((v) => v.player_id && ap50Ids.has(v.player_id))
      .map((v) => v.auction_value ?? 0),
  );
  if (ap50Max < 16) {
    issues.push({
      area: "mid-draft",
      type: "model issue",
      detail: `after_pick_50 max ${ap50Max} (expected ~18.6)`,
    });
  }

  const uniqueShown = new Set(top50av.map((r) => r.shown)).size;
  if (uniqueShown < 20) {
    issues.push({
      area: "research display",
      type: "UI display issue",
      detail: `Top 50 has only ${uniqueShown} unique rounded dollar shelves — rounding may over-compress`,
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    engine_url: process.env.AMETHYST_API_URL,
    pre_draft: {
      pool: pre.draftable_player_ids?.length,
      UTIL: util,
      max_raw: top50av[0]?.raw,
      max_shown: top50av[0]?.shown,
      tier_counts_draftable: tierCounts(vals, ids),
      market_pressure: pre.context_v2?.market_pressure ?? null,
      curve_phase: pre.curve_inputs?.phase,
      auction_curve_reason: pre.auction_curve_reason,
    },
    after_pick_50: {
      pool: ap50.draftable_player_ids?.length,
      max_raw: ap50Max,
      max_shown: displayDollar(ap50Max),
      curve_phase: ap50.curve_inputs?.phase,
    },
    top50_by_auction_value: top50av,
    top50_by_auction_rank: topN(vals, ids, 50, "auction_rank"),
    position_samples: {
      C: filterPosition(vals, ids, "C"),
      SP: filterPosition(vals, ids, "SP"),
      RP: filterPosition(vals, ids, "RP"),
      OF: filterPosition(vals, ids, "OF"),
    },
    tracked,
    issues,
    verdict:
      issues.filter((i) => i.type === "model issue").length === 0
        ? issues.length === 0
          ? "no issue"
          : "minor UI/copy only"
        : "model follow-up",
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
