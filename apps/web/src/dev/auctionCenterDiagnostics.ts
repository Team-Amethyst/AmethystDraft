/**
 * Dev-only console diagnostics for Auction Center valuation plumbing.
 * See `docs/business-heuristics.md` — not product behavior.
 */
import type { ValuationResponse, ValuationResult } from "../api/engine";
import { valuationRowPipelineSnapshot } from "../api/valuationNormalize";
import {
  actionableBidFromRecommendedAndMaxBid,
  engineFiniteOrNull,
} from "../domain/auctionCenterValuation";
import type { Player } from "../types/player";
import type { CommandCenterWalletCaps } from "../utils/valuation";
import { normalizeValuationPlayerId } from "../utils/valuation";

export function logDevValuationPlayerRequest(args: {
  playerId: string;
  leagueId: string;
  userTeamId: string;
}): void {
  if (!import.meta.env.DEV) return;
  const playerId = normalizeValuationPlayerId(args.playerId);
  console.info("[valuation player request]", {
    selected_player_id: playerId,
    request_url: `/api/engine/leagues/${args.leagueId}/valuation/player`,
    request_body: {
      player_id: String(args.playerId),
      user_team_id: args.userTeamId,
      inflation_model: "replacement_slots_v2",
    },
  });
}

export function logDevValuationPlayerHttpResponse(args: {
  playerId: string;
  row:
    | ValuationResult
    | undefined;
  valuationsLen: number;
}): void {
  if (!import.meta.env.DEV) return;
  const playerId = normalizeValuationPlayerId(args.playerId);
  console.info("[valuation player response]", {
    selected_player_id: playerId,
    response_player_id: args.row?.player_id ?? null,
    recommended_bid: args.row?.recommended_bid ?? null,
    team_adjusted_value: args.row?.team_adjusted_value ?? null,
    edge: args.row?.edge ?? null,
  });
}

export function logDevCcValuationPlayerResponseBody(args: {
  playerId: string;
  row: ValuationResult | undefined;
  valuationsLen: number;
}): void {
  if (!import.meta.env.DEV) return;
  const playerId = normalizeValuationPlayerId(args.playerId);
  const p = args.row;
  console.info("[cc-valuation-player-response]", {
    requested_id: playerId,
    player: p,
    numeric_fields: p && {
      team_adjusted_value: p.team_adjusted_value,
      recommended_bid: p.recommended_bid,
      adjusted_value: p.adjusted_value,
      baseline_value: p.baseline_value,
    },
    valuations_len: args.valuationsLen,
  });
}

export function runDevMergedValuationPipelineLog(args: {
  selectedPlayer: Player;
  myWalletCaps: CommandCenterWalletCaps | null;
  activeValuationRow: ValuationResult | undefined;
  displayValuationRow: ValuationResult | undefined;
  mergedValuationRow: ValuationResult | undefined;
  valuationMap: Map<string, ValuationResult>;
}): void {
  if (!import.meta.env.DEV) return;
  const p = args.selectedPlayer;
  const maxB =
    args.myWalletCaps != null && Number.isFinite(args.myWalletCaps.maxBid)
      ? args.myWalletCaps.maxBid
      : null;
  const eng = args.activeValuationRow;
  const merged = args.displayValuationRow;
  const cardRow = args.mergedValuationRow;

  const nullRowSnap = (label: string) => ({
    source: label,
    player_id: p.id,
    name: p.name,
    recommended_bid: null,
    team_adjusted_value: null,
    adjusted_value: null,
    baseline_value: null,
    edge: null,
    finite_recommended_bid: null as number | null,
    max_bid: maxB,
  });

  const catalogSnap = {
    source: "1_raw_catalog_player",
    player_id: p.id,
    name: p.name,
    recommended_bid: p.recommended_bid ?? null,
    team_adjusted_value: p.team_adjusted_value ?? null,
    adjusted_value: p.adjusted_value ?? null,
    baseline_value: p.baseline_value ?? null,
    edge: null,
    finite_recommended_bid: engineFiniteOrNull(p.recommended_bid),
    max_bid: maxB,
  };

  const engineSnap = eng
    ? {
        source: "2_matched_engine_row",
        player_id: eng.player_id,
        name: eng.name,
        recommended_bid: eng.recommended_bid ?? null,
        team_adjusted_value: eng.team_adjusted_value ?? null,
        adjusted_value: eng.adjusted_value ?? null,
        baseline_value: eng.baseline_value ?? null,
        edge: eng.edge ?? null,
        finite_recommended_bid: engineFiniteOrNull(eng.recommended_bid),
        max_bid: maxB,
      }
    : nullRowSnap("2_matched_engine_row (none)");

  const finalSnap = cardRow
    ? {
        source: "3_final_row_passed_to_BidDecisionCard",
        player_id: cardRow.player_id,
        name: cardRow.name,
        recommended_bid: cardRow.recommended_bid ?? null,
        team_adjusted_value: cardRow.team_adjusted_value ?? null,
        adjusted_value: cardRow.adjusted_value ?? null,
        baseline_value: cardRow.baseline_value ?? null,
        edge: cardRow.edge ?? null,
        finite_recommended_bid: engineFiniteOrNull(cardRow.recommended_bid),
        max_bid: maxB,
      }
    : nullRowSnap("3_final_row_passed_to_BidDecisionCard (none)");

  const actionablePreview =
    cardRow != null ? actionableBidFromRecommendedAndMaxBid(cardRow, maxB) : null;

  console.log("[BidDecisionCard valuation diagnostic]", {
    raw_catalog_player: catalogSnap,
    matched_engine_row: engineSnap,
    final_row_passed_to_BidDecisionCard: finalSnap,
    actionableBid_preview: actionablePreview,
    engine_missing_catalog_had: eng
      ? {
          recommended_bid:
            (eng.recommended_bid == null || !Number.isFinite(eng.recommended_bid)) &&
            p.recommended_bid != null &&
            Number.isFinite(p.recommended_bid),
          team_adjusted_value:
            (eng.team_adjusted_value == null ||
              !Number.isFinite(eng.team_adjusted_value)) &&
            p.team_adjusted_value != null &&
            Number.isFinite(p.team_adjusted_value),
        }
      : null,
    merge_recovered_field:
      merged && eng
        ? {
            recommended_bid:
              (eng.recommended_bid == null || !Number.isFinite(eng.recommended_bid)) &&
              merged.recommended_bid != null &&
              Number.isFinite(merged.recommended_bid),
            team_adjusted_value:
              (eng.team_adjusted_value == null ||
                !Number.isFinite(eng.team_adjusted_value)) &&
              merged.team_adjusted_value != null &&
              Number.isFinite(merged.team_adjusted_value),
          }
        : null,
  });

  const nid = normalizeValuationPlayerId(p.id);
  const mapEntry = args.valuationMap.get(nid);
  console.info("[valuation pipeline]", {
    source: "draftroom_ui",
    note: "A–D: logs with source=api_client_http from getValuation (A,B) and getValuationPlayer (C,D).",
    selected_player_id: nid,
    E_valuationMap_entry: valuationRowPipelineSnapshot(mapEntry),
    F_mergedValuationRow_for_BidDecisionCard: valuationRowPipelineSnapshot(
      args.mergedValuationRow,
    ),
    catalog_player_valuation_fields: {
      player_id: p.id,
      recommended_bid: p.recommended_bid ?? null,
      team_adjusted_value: p.team_adjusted_value ?? null,
      edge: null,
      adjusted_value: p.adjusted_value ?? null,
      baseline_value: p.baseline_value ?? null,
      value: p.value,
    },
  });
}

export function runDevEngineBoardRowConsistencyCheck(args: {
  engineMarket: ValuationResponse;
  selectedPlayer: Player;
  valuationMap: Map<string, ValuationResult>;
}): void {
  if (!import.meta.env.DEV) return;
  const nid = normalizeValuationPlayerId(args.selectedPlayer.id);
  const inBoard = args.engineMarket.valuations.some(
    (x) => normalizeValuationPlayerId(x.player_id) === nid,
  );
  if (!inBoard) return;
  const vr = args.valuationMap.get(nid);
  if (!vr) {
    console.warn(
      "[AuctionCenter] engine snapshot lists player but valuationMap has no row",
      { player_id: nid },
    );
    return;
  }
  if (
    typeof vr.recommended_bid !== "number" ||
    !Number.isFinite(vr.recommended_bid) ||
    typeof vr.team_adjusted_value !== "number" ||
    !Number.isFinite(vr.team_adjusted_value)
  ) {
    console.warn(
      "[AuctionCenter] valuation row for board player missing recommended_bid or team_adjusted_value",
      {
        player_id: nid,
        recommended_bid: vr.recommended_bid,
        team_adjusted_value: vr.team_adjusted_value,
      },
    );
  }
}

export function runDevValuationRowChangeLog(args: {
  selectedPlayerId: string;
  selectedPlayerValuationKey: string;
  valuationMap: Map<string, ValuationResult>;
}): void {
  if (!import.meta.env.DEV) return;
  if (
    !args.selectedPlayerValuationKey ||
    args.selectedPlayerValuationKey.startsWith("missing:")
  ) {
    return;
  }
  const v = args.valuationMap.get(normalizeValuationPlayerId(args.selectedPlayerId));
  if (!v) return;
  console.info("[cc-valuation-change]", {
    t: new Date().toISOString(),
    player_id: v.player_id,
    baseline_value: v.baseline_value,
    adjusted_value: v.adjusted_value,
    recommended_bid: v.recommended_bid,
    team_adjusted_value: v.team_adjusted_value,
    reason: "valuation_row_key_changed",
  });
  const y = v.team_adjusted_value;
  const l = v.recommended_bid;
  const m = v.adjusted_value;
  if (
    y !== undefined &&
    l !== undefined &&
    Number.isFinite(y) &&
    Number.isFinite(l) &&
    Number.isFinite(m) &&
    y === l &&
    l === m
  ) {
    console.warn(
      "[cc-valuation-change] team_adjusted_value, recommended_bid, and adjusted_value are identical — check Engine payload.",
    );
  }
}
