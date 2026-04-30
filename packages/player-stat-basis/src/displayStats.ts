import type {
  BattingCountLine,
  DisplayBatting,
  DisplayPitching,
  PitchingCountLine,
  PlayerStatSnapshot,
  StatBasis,
} from "./types";

function clampNonNegative(value: number): number {
  return Math.max(0, Math.round(value));
}

function formatRate(value: number): string {
  if (!Number.isFinite(value)) return "0.000";
  return value.toFixed(3);
}

function toDisplayBatting(batting?: BattingCountLine): DisplayBatting | undefined {
  if (!batting) return undefined;
  return {
    avg: String(batting.avg ?? "0.000"),
    hr: Number(batting.hr ?? 0),
    rbi: Number(batting.rbi ?? 0),
    runs: Number(batting.runs ?? 0),
    sb: Number(batting.sb ?? 0),
  };
}

function toDisplayPitching(
  pitching?: PitchingCountLine,
): DisplayPitching | undefined {
  if (!pitching) return undefined;
  return {
    era: String(pitching.era ?? "0.000"),
    whip: String(pitching.whip ?? "0.000"),
    wins: Number(pitching.wins ?? 0),
    saves: Number(pitching.saves ?? 0),
    holds: Number(pitching.holds ?? 0),
    strikeouts: Number(pitching.strikeouts ?? 0),
    completeGames: Number(pitching.completeGames ?? 0),
  };
}

/**
 * Non-projection stat bases still use placeholder multipliers in the UI until
 * the API exposes true single-year and multi-year stat lines.
 */
function applyDummyDisplayAdjustments(
  bat: DisplayBatting | undefined,
  pit: DisplayPitching | undefined,
  statBasis: StatBasis,
): { bat?: DisplayBatting; pit?: DisplayPitching } {
  if (statBasis === "projections") {
    return { bat, pit };
  }

  if (statBasis === "last-year") {
    return {
      bat: bat
        ? {
            avg: formatRate(parseFloat(bat.avg) * 0.985),
            hr: clampNonNegative(bat.hr * 1.08),
            rbi: clampNonNegative(bat.rbi * 1.04),
            runs: clampNonNegative(bat.runs * 0.97),
            sb: clampNonNegative(bat.sb * 0.94),
          }
        : undefined,
      pit: pit
        ? {
            era: formatRate(parseFloat(pit.era) * 1.06),
            whip: formatRate(parseFloat(pit.whip) * 1.04),
            wins: clampNonNegative(pit.wins * 0.96),
            saves: clampNonNegative(pit.saves * 1.03),
            holds: clampNonNegative(pit.holds * 1.03),
            strikeouts: clampNonNegative(pit.strikeouts * 1.02),
            completeGames: clampNonNegative(pit.completeGames * 0.96),
          }
        : undefined,
    };
  }

  return {
    bat: bat
      ? {
          avg: formatRate(parseFloat(bat.avg) * 0.995),
          hr: clampNonNegative(bat.hr * 0.95),
          rbi: clampNonNegative(bat.rbi * 0.96),
          runs: clampNonNegative(bat.runs * 0.96),
          sb: clampNonNegative(bat.sb * 0.92),
        }
      : undefined,
    pit: pit
      ? {
          era: formatRate(parseFloat(pit.era) * 1.02),
          whip: formatRate(parseFloat(pit.whip) * 1.01),
          wins: clampNonNegative(pit.wins * 0.94),
          saves: clampNonNegative(pit.saves * 0.95),
          holds: clampNonNegative(pit.holds * 0.95),
          strikeouts: clampNonNegative(pit.strikeouts * 0.95),
          completeGames: clampNonNegative(pit.completeGames * 0.94),
        }
      : undefined,
  };
}

export function resolveDisplayStats(
  player: PlayerStatSnapshot,
  statBasis: StatBasis,
): { bat?: DisplayBatting; pit?: DisplayPitching } {
  const preferredBat =
    statBasis === "projections"
      ? player.projection?.batting
      : player.stats?.batting;
  const fallbackBat =
    statBasis === "projections"
      ? player.stats?.batting
      : player.projection?.batting;
  const preferredPit =
    statBasis === "projections"
      ? player.projection?.pitching
      : player.stats?.pitching;
  const fallbackPit =
    statBasis === "projections"
      ? player.stats?.pitching
      : player.projection?.pitching;

  const bat = toDisplayBatting(preferredBat ?? fallbackBat);
  const pit = toDisplayPitching(preferredPit ?? fallbackPit);

  return applyDummyDisplayAdjustments(bat, pit, statBasis);
}

export function getCategoryTags(
  bat: DisplayBatting | undefined,
  pit: DisplayPitching | undefined,
): string[] {
  const tags: string[] = [];

  if (bat) {
    if (bat.hr >= 25) tags.push("HR+");
    if (bat.sb >= 15) tags.push("SB+");
    if (parseFloat(bat.avg) >= 0.285) tags.push("AVG+");
    if (bat.runs >= 85) tags.push("R+");
    if (bat.rbi >= 85) tags.push("RBI+");
  }
  if (pit) {
    if (pit.strikeouts >= 175) tags.push("K+");
    if (pit.wins >= 10) tags.push("W+");
    if (pit.saves >= 20) tags.push("SV+");
  }
  return tags;
}

const PITCHER_POSITIONS = new Set(["SP", "RP", "P"]);

export function playerIsPitcher(p: PlayerStatSnapshot): boolean {
  const hasPit = !!(p.projection?.pitching ?? p.stats?.pitching);
  const hasBat = !!(p.projection?.batting ?? p.stats?.batting);
  if (hasPit && !hasBat) return true;
  if (hasBat && !hasPit) return false;
  return PITCHER_POSITIONS.has(p.position.toUpperCase());
}

export function getDisplayStatValue(
  catName: string,
  catType: "batting" | "pitching",
  bat: DisplayBatting | undefined,
  pit: DisplayPitching | undefined,
  player: PlayerStatSnapshot,
): string {
  const n = catName.toUpperCase();
  if (catType === "batting") {
    if (!bat && !player.stats?.batting) return "-";
    switch (n) {
      case "HR":
        return String(bat?.hr ?? "-");
      case "RBI":
        return String(bat?.rbi ?? "-");
      case "R":
      case "RUNS":
        return String(bat?.runs ?? "-");
      case "SB":
        return String(bat?.sb ?? "-");
      case "AVG":
        return bat?.avg ?? "-";
      case "OBP":
        return player.stats?.batting?.obp ?? "-";
      case "SLG":
        return player.stats?.batting?.slg ?? "-";
      default:
        return "-";
    }
  } else {
    if (!pit && !player.stats?.pitching) return "-";
    switch (n) {
      case "W":
      case "WINS":
        return String(pit?.wins ?? "-");
      case "K":
      case "SO":
        return String(pit?.strikeouts ?? "-");
      case "ERA":
        return pit?.era ?? "-";
      case "WHIP":
      case "WALKS + HITS PER IP":
        return pit?.whip ?? "-";
      case "SV":
      case "SAVES":
        return String(pit?.saves ?? "-");
      case "HLD":
      case "HOLDS":
        return String(pit?.holds ?? "-");
      case "CG":
      case "COMPLETE GAMES":
        return String(pit?.completeGames ?? "-");
      case "IP": {
        const ip = player.stats?.pitching?.innings;
        if (ip === undefined || ip === null) return "-";
        return String(ip);
      }
      default:
        return "-";
    }
  }
}

/** One-line summary for mobile list rows — matches web table stat resolution. */
export function formatResearchStatSummaryLine(
  player: PlayerStatSnapshot,
  statBasis: StatBasis,
): string | null {
  const { bat, pit } = resolveDisplayStats(player, statBasis);
  const prefix =
    statBasis === "projections" ? "Proj" : statBasis === "last-year" ? "1Y" : "3Y";

  if (bat) {
    return `${prefix} AVG ${bat.avg} • HR ${bat.hr} • RBI ${bat.rbi} • SB ${bat.sb}`;
  }
  if (pit) {
    return `${prefix} ERA ${pit.era} • WHIP ${pit.whip} • K ${pit.strikeouts} • SV ${pit.saves}`;
  }
  return null;
}
