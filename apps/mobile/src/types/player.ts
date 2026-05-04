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