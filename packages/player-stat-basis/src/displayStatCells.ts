import type {
  DisplayBatting,
  DisplayPitching,
  PlayerStatSnapshot,
  StatBasis,
} from "./types";

function battingObpSource(
  player: PlayerStatSnapshot,
  statBasis: StatBasis,
): string | undefined {
  if (statBasis === "3-year-avg" && player.stats3yr?.batting?.obp != null) {
    return player.stats3yr.batting.obp;
  }
  return player.stats?.batting?.obp;
}

function battingSlgSource(
  player: PlayerStatSnapshot,
  statBasis: StatBasis,
): string | undefined {
  if (statBasis === "3-year-avg" && player.stats3yr?.batting?.slg != null) {
    return player.stats3yr.batting.slg;
  }
  return player.stats?.batting?.slg;
}

function pitchingIpSource(
  player: PlayerStatSnapshot,
  statBasis: StatBasis,
): string | number | undefined {
  if (statBasis === "3-year-avg" && player.stats3yr?.pitching?.innings != null) {
    return player.stats3yr.pitching.innings;
  }
  return player.stats?.pitching?.innings;
}

export function getDisplayStatValue(
  catName: string,
  catType: "batting" | "pitching",
  bat: DisplayBatting | undefined,
  pit: DisplayPitching | undefined,
  player: PlayerStatSnapshot,
  statBasis: StatBasis,
): string {
  const n = catName.toUpperCase();
  if (catType === "batting") {
    if (n !== "OBP" && n !== "SLG" && !bat) return "-";
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
        return battingObpSource(player, statBasis) ?? "-";
      case "SLG":
        return battingSlgSource(player, statBasis) ?? "-";
      default:
        return "-";
    }
  } else {
    if (n !== "IP" && !pit) return "-";
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
        const ip = pitchingIpSource(player, statBasis);
        if (ip === undefined || ip === null) return "-";
        return String(ip);
      }
      default:
        return "-";
    }
  }
}
