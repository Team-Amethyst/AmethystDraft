export interface Player {
  id: string;
  mlbId: number;
  name: string;
  team: string;
  position: string;
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
      strikeouts: number;
      innings: string;
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
      strikeouts: number;
    };
  };
  outlook: string;
}
