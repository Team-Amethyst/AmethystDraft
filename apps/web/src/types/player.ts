import type { ValuationExplain } from "../api/engine";

/** Engine-aligned catalog row classification (`GET /api/players`). */
export type CatalogKind =
  | "valuation_eligible"
  | "market_only"
  | "roster_context";

export interface Player {
  id: string;
  mlbId: number;
  name: string;
  team: string;
  position: string;
  positions?: string[];
  age: number;
  /** Internal catalog model rank (not market ADP). */
  catalog_rank: number;
  /** Internal catalog model tier grouping. */
  catalog_tier: number;
  /** External draft-site ADP when Engine provides a real source. */
  market_adp?: number;
  /** Identifies the external ADP feed (e.g. site or vendor name). */
  market_adp_source?: string;
  /** ISO timestamp when market ADP was last refreshed. */
  market_adp_updated_at?: string;
  /** Lower bound of reported market ADP range when Engine provides it. */
  market_adp_min?: number;
  /** Upper bound of reported market ADP range when Engine provides it. */
  market_adp_max?: number;
  /** Sample size or draft count behind the market ADP aggregate when Engine provides it. */
  market_pick_count?: number;
  /** When false, exclude from Engine valuation math; do not use `value` as Auction Value fallback. */
  valuation_eligible?: boolean;
  catalog_kind?: CatalogKind;
  /** Research: Engine draftable pool membership (client from board `draftable_player_ids`). */
  research_draftable?: "draftable" | "outside" | "unknown";
  value: number;
  /** Rank by league auction value from latest valuation row (optional until merged). */
  auction_rank?: number;
  /** Tier by auction value within valuation response (optional until merged). */
  auction_tier?: number;
  /** Rank by baseline strength before auction economics. */
  baseline_rank?: number;
  /** Tier by baseline strength. */
  baseline_tier?: number;
  baseline_value?: number;
  /** League-wide fair auction dollars from the valuation contract. */
  auction_value?: number;
  /** Engine suggested next bid for your team. */
  recommended_bid?: number;
  /** Engine hard bid cap for this player given your roster context. */
  max_bid?: number;
  /** Value to your roster (Engine: team_value historically). */
  team_value?: number;
  edge?: number;
  inflation_model?: "replacement_slots_v2";
  indicator?: "Steal" | "Reach" | "Fair Value";
  explain_v2?: {
    indicator: "Steal" | "Reach" | "Fair Value";
    auction_target: number;
    list_value: number;
    adjustments: {
      scarcity: number;
      inflation: number;
      other: number;
    };
    drivers: Array<{
      label: string;
      impact: number;
      reason: string;
    }>;
    confidence: number;
  };
  why?: string[];
  market_notes?: string[];
  /** Row-level Engine explainability when requested (`explain_valuation_rows`). */
  valuation_explain?: ValuationExplain;
  recommended_bid_note?: string;
  edge_note?: string;
  headshot: string;
  stats: {
    batting?: {
      avg: string;
      hr: number;
      rbi: number;
      runs: number;
      sb: number;
      obp: string;
      slg: string;
    };
    pitching?: {
      era: string;
      whip: string;
      wins: number;
      saves: number;
      holds: number;
      strikeouts: number;
      innings: string;
      completeGames: number;
    };
  };
  projection: {
    batting?: {
      avg: string;
      hr: number;
      rbi: number;
      runs: number;
      sb: number;
    };
    pitching?: {
      era: string;
      whip: string;
      wins: number;
      saves: number;
      holds: number;
      strikeouts: number;
      completeGames: number;
      innings?: number;
    };
  };
  /** Equal-weight 3-season blend from catalog API. */
  stats3yr?: {
    batting?: {
      avg: string;
      hr: number;
      rbi: number;
      runs: number;
      sb: number;
      obp: string;
      slg: string;
    };
    pitching?: {
      era: string;
      whip: string;
      wins: number;
      saves: number;
      holds: number;
      strikeouts: number;
      completeGames: number;
      innings: number;
    };
  };
  outlook: string;
  injuryStatus?: string;
  /** 0–3 canonical severity from catalog (Engine `injury_overrides`). */
  injurySeverity?: number;
  springStats?: {
    batting?: {
      avg: string;
      hr: number;
      rbi: number;
      runs: number;
      sb: number;
      ab: number;
    };
    pitching?: {
      era: string;
      whip: string;
      wins: number;
      saves: number;
      strikeouts: number;
      innings: string;
    };
  };
}
