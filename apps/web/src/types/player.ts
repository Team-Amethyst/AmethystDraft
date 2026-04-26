export interface Player {
  id: string;
  mlbId: number;
  name: string;
  team: string;
  position: string;
  positions?: string[];
  age: number;
  adp: number;
  value: number;
  tier: number;
  baseline_value?: number;
  adjusted_value?: number;
  recommended_bid?: number;
  team_adjusted_value?: number;
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
  outlook: string;
  injuryStatus?: string;
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
