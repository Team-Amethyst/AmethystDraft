/** Which stat lens the research-style tables use for counting/rate columns. */
export type StatBasis = "projections" | "last-year" | "3-year-avg";

/** Web Research page localStorage key (existing installs). */
export const RESEARCH_STAT_BASIS_STORAGE_KEY_WEB = "amethyst-research-statbasis";

/** Mobile Research AsyncStorage key (separate from web so device prefs stay stable). */
export const RESEARCH_STAT_BASIS_STORAGE_KEY_MOBILE =
  "amethyst-research-statbasis-mobile";

export const STAT_BASIS_VALUES: readonly StatBasis[] = [
  "projections",
  "last-year",
  "3-year-avg",
] as const;

export type DisplayBatting = {
  avg: string;
  hr: number;
  rbi: number;
  runs: number;
  sb: number;
};

export type DisplayPitching = {
  era: string;
  whip: string;
  wins: number;
  saves: number;
  holds: number;
  strikeouts: number;
  completeGames: number;
};

/** Minimal player shape for stat display (web `Player` / mobile `Player` compatible). */
export type BattingCountLine = {
  avg?: string;
  hr?: number;
  rbi?: number;
  runs?: number;
  sb?: number;
  obp?: string;
  slg?: string;
};

export type PitchingCountLine = {
  era?: string;
  whip?: string;
  wins?: number;
  saves?: number;
  holds?: number;
  strikeouts?: number;
  /** MLB catalog uses string IP on `stats`; projection may use a number. */
  innings?: string | number;
  completeGames?: number;
};

export type PlayerStatSnapshot = {
  position: string;
  stats?: {
    batting?: BattingCountLine;
    pitching?: PitchingCountLine;
  };
  projection?: {
    batting?: BattingCountLine;
    pitching?: PitchingCountLine;
  };
};
