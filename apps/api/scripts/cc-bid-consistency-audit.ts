/**
 * Command Center vs Research bid consistency audit (read-only).
 *
 *   cd apps/api && pnpm exec tsx scripts/cc-bid-consistency-audit.ts
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import League from "../src/models/League";
import RosterEntry from "../src/models/RosterEntry";
import {
  buildValuationContext,
  finalizeEngineValuationPostPayload,
} from "../src/lib/engineContext";
import { resolveAuctionCurveModelForDraftRequest } from "../src/lib/auctionCurveModel";
import { amethyst } from "../src/lib/amethyst";
import { shapeValuationResponseForDraft } from "../src/lib/draftValuationContract";

const __dir = dirname(fileURLToPath(import.meta.url));

const NAMES = [
  "Framber Valdez",
  "Tarik Skubal",
  "Bryan Woo",
  "Joe Ryan",
  "Garrett Crochet",
  "Aaron Judge",
  "Julio Rodríguez",
  "Bobby Witt Jr.",
  "José Ramírez",
  "Vladimir Guerrero Jr.",
];

type ValRow = {
  player_id?: string;
  name?: string;
  auction_value?: number;
  recommended_bid?: number;
  team_value?: number;
  edge?: number;
  baseline_value?: number;
  max_bid?: number;
};

function normName(n: string): string {
  return n
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function roundWhole(n: number): number {
  return Math.round(n);
}

function fmt$(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const r = roundWhole(n);
  return r < 0 ? `-$${Math.abs(r)}` : `$${r}`;
}

function fmtSigned(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const r = roundWhole(n);
  const body = `$${Math.abs(r)}`;
  if (r > 0) return `+${body}`;
  if (r < 0) return `-${body}`;
  return "$0";
}

/** Mirrors commandCenterRoundBidIncrement in web valuation.ts */
function roundBid(n: number, maxExecutable?: number): number {
  let x = Math.max(0, Math.round(n * 2) / 2);
  if (maxExecutable != null && Number.isFinite(maxExecutable)) {
    x = Math.min(x, maxExecutable);
  }
  return x;
}

function rosterSlotsToRecord(rosterSlots: unknown): Record<string, number> {
  if (rosterSlots == null || typeof rosterSlots !== "object") return {};
  if (Array.isArray(rosterSlots)) {
    const out: Record<string, number> = {};
    for (const row of rosterSlots) {
      if (row && typeof row === "object" && "position" in row && "count" in row) {
        const pos = String((row as { position: unknown }).position).trim();
        const n = Number((row as { count?: unknown }).count);
        if (pos && Number.isFinite(n)) out[pos] = Math.max(0, Math.floor(n));
      }
    }
    return out;
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rosterSlots as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = Math.max(0, Math.floor(n));
  }
  return out;
}

function isReserveRosterSlot(slot: string | undefined): boolean {
  const s = (slot ?? "").toUpperCase();
  return s.includes("MIN") || s.includes("TAXI");
}

/** Approximate wallet caps (active auction entries only; open spots = slot sum − filled count). */
function demoWalletCaps(
  budget: number,
  rosterSlots: unknown,
  myEntries: { price: number; rosterSlot?: string; isKeeper?: boolean }[],
) {
  const slots = rosterSlotsToRecord(rosterSlots);
  let capacity = 0;
  for (const [pos, count] of Object.entries(slots)) {
    if (!["BN", "MINORS", "TAXI"].includes(pos)) capacity += count;
  }
  const active = myEntries.filter(
    (e) => !e.isKeeper && !isReserveRosterSlot(e.rosterSlot),
  );
  const spent = active.reduce((s, e) => s + (e.price ?? 0), 0);
  const filled = active.length;
  const openSpots = Math.max(0, capacity - filled);
  const budgetRemaining = Math.max(0, budget - spent);
  const maxExecutable =
    openSpots <= 0
      ? 0
      : Math.max(0, budgetRemaining - Math.max(0, openSpots - 1));
  return { budgetRemaining, openSpots, maxExecutable, spent, filled, capacity };
}

/** Mirrors commandCenterBidDecision */
function ccBidDecision(
  row: ValRow,
  caps: ReturnType<typeof demoWalletCaps>,
) {
  const yourValue = row.team_value;
  let baseUncapped = row.recommended_bid;
  if (yourValue != null && baseUncapped != null) {
    baseUncapped = Math.min(baseUncapped, yourValue);
  }
  const maxExecutableBid = Math.max(0, caps.maxExecutable);
  const notBidable = maxExecutableBid <= 0 || caps.openSpots <= 0;
  const rawSuggested = notBidable
    ? 0
    : Math.min(baseUncapped ?? 0, maxExecutableBid);
  const suggestedBid = notBidable
    ? 0
    : roundBid(rawSuggested, maxExecutableBid);
  const budgetLimited =
    !notBidable &&
    baseUncapped != null &&
    baseUncapped > maxExecutableBid + 1e-6;
  return { yourValue, suggestedBid, baseUncapped, budgetLimited, notBidable, maxExecutableBid };
}

/** CC ladder: round(team_value) - round(suggested_bid) */
function ccBidEdge(teamValue: number | undefined, suggested: number): number | undefined {
  if (teamValue == null || !Number.isFinite(teamValue)) return undefined;
  return roundWhole(teamValue) - roundWhole(suggested);
}

/** Research modal: prefers engine edge */
function researchEdgeOrDiff(row: ValRow): number | undefined {
  if (row.edge != null && Number.isFinite(row.edge)) return row.edge;
  if (row.team_value != null && row.recommended_bid != null) {
    return row.team_value - row.recommended_bid;
  }
  return undefined;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI required");

  await mongoose.connect(uri);
  const leagueDoc = await League.findOne({
    name: /\[Demo\].*pre\s*draft/i,
  })
    .sort({ updatedAt: -1 })
    .lean();
  if (!leagueDoc) throw new Error("No demo league");

  const entries = await RosterEntry.find({ leagueId: leagueDoc._id }).lean();
  const userTeamId = "team_1";

  const context = await buildValuationContext(
    leagueDoc as Parameters<typeof buildValuationContext>[0],
    entries as Parameters<typeof buildValuationContext>[1],
    {
      userTeamId,
      auctionCurveModel: resolveAuctionCurveModelForDraftRequest({}),
    },
  );
  const payload = finalizeEngineValuationPostPayload(context);
  const { data: rawEngine } = await amethyst.post("/valuation/calculate", payload);
  const data = shapeValuationResponseForDraft(rawEngine, { debug: false }) as {
    valuations?: ValRow[];
    context_v2?: { market_pressure?: unknown };
    inflation_factor?: number;
  };
  const vals = (data.valuations ?? []) as ValRow[];

  const myEntries = entries.filter((e) => String(e.teamId) === userTeamId);
  const caps = demoWalletCaps(
    leagueDoc.budget ?? 260,
    leagueDoc.rosterSlots,
    myEntries.map((e) => ({
      price: e.price,
      rosterSlot: e.rosterSlot,
      isKeeper: e.isKeeper,
    })),
  );
  const mp = data.context_v2?.market_pressure as Record<string, unknown> | undefined;

  const players: Record<string, unknown>[] = [];
  const missing: string[] = [];
  const notes: string[] = [];

  for (const name of NAMES) {
    const row = vals.find((v) => normName(v.name ?? "") === normName(name));
    if (!row) {
      missing.push(name);
      continue;
    }

    const rawRow = ((rawEngine.valuations ?? []) as ValRow[]).find(
      (v) => normName(v.name ?? "") === normName(name),
    );
    const dec = ccBidDecision(row, caps);
    const edgeCc = ccBidEdge(dec.yourValue, dec.suggestedBid);
    const edgeResearch = researchEdgeOrDiff(row);
    const teamMinusRec =
      row.team_value != null && row.recommended_bid != null
        ? roundWhole(row.team_value - row.recommended_bid)
        : undefined;
    const edgeFromTeamMinusRec =
      row.team_value != null && row.recommended_bid != null
        ? +(row.team_value - row.recommended_bid).toFixed(2)
        : undefined;

    if (
      row.edge != null &&
      edgeFromTeamMinusRec != null &&
      Math.abs(row.edge - edgeFromTeamMinusRec) > 0.02
    ) {
      notes.push(
        `${name}: BFF edge (${row.edge}) ≠ team_value−recommended_bid (${edgeFromTeamMinusRec})`,
      );
    }
    if (
      edgeCc != null &&
      edgeFromTeamMinusRec != null &&
      edgeCc !== roundWhole(edgeFromTeamMinusRec) &&
      edgeCc !== roundWhole(row.edge ?? NaN)
    ) {
      notes.push(
        `${name}: CC Bid Edge display (${edgeCc}) = round(team_value)−round(suggested_bid=${dec.suggestedBid}); engine edge=${row.edge}`,
      );
    }

    players.push({
      name: row.name,
      player_id: row.player_id,
      engine_bff_shaped: {
        auction_value: row.auction_value,
        recommended_bid: row.recommended_bid,
        team_value: row.team_value,
        edge: row.edge,
        baseline_value: row.baseline_value,
        max_bid: row.max_bid,
      },
      engine_raw: rawRow
        ? {
            team_adjusted_value: (rawRow as Record<string, unknown>)
              .team_adjusted_value,
            adjusted_value: (rawRow as Record<string, unknown>).adjusted_value,
          }
        : null,
      research_auction_display: fmt$(row.auction_value),
      command_center: {
        auction_value_display: fmt$(row.auction_value),
        suggested_bid_display: fmt$(dec.suggestedBid),
        suggested_bid_raw: dec.suggestedBid,
        team_value_display: fmt$(dec.yourValue),
        bid_edge_display: fmtSigned(edgeCc),
        bid_edge_raw: edgeCc,
        budget_limited: dec.budgetLimited,
        base_uncapped: dec.baseUncapped,
      },
      team_value_minus_auction: fmtSigned(
        row.team_value != null && row.auction_value != null
          ? row.team_value - row.auction_value
          : undefined,
      ),
      recommended_minus_auction: fmtSigned(
        row.recommended_bid != null && row.auction_value != null
          ? row.recommended_bid - row.auction_value
          : undefined,
      ),
      research_modal_bid_edge: fmtSigned(edgeResearch),
      team_value_minus_recommended_rounded: fmtSigned(teamMinusRec),
    });
  }

  const out = {
    generated_at: new Date().toISOString(),
    league: { id: String(leagueDoc._id), name: leagueDoc.name, userTeamId },
    wallet_caps_demo_team: caps,
    market_pressure_labels: mp
      ? {
          market_inflation: (mp.market_inflation as { label?: string })?.label,
          budget_pressure: (mp.budget_pressure as { label?: string })?.label,
          keeper_compression: (mp.keeper_compression as { label?: string })
            ?.label,
        }
      : null,
    inflation_factor: data.inflation_factor,
    players,
    missing,
    notes,
    formulas: {
      auction_value_research_cc:
        "Same engine field auction_value; both use Math.round for display",
      suggested_bid:
        "min(recommended_bid, team_value), capped by maxExecutableBid, half-dollar round",
      team_value: "engine team_value (roster-specific)",
      bid_edge_cc: "round(team_value) − round(suggested_bid)",
      bid_edge_research_modal: "engine edge if set, else team_value − recommended_bid",
      category_impact: "Client standings math — not on valuation row",
      market_pressure: "context_v2.market_pressure on shared valuation response",
    },
    cache:
      "Single getValuation board per league+team+roster fingerprint; CC reuses engineMarket, Research merges same valuations into players",
  };

  const outPath = join(__dir, "../../tmp/cc-bid-consistency-audit.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
