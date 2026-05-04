import type { Player as ApiPlayer } from "../../types/player";
import type { Player } from "../../types/league";
import {
  hasPitcherEligibility,
  normalizePlayerPositions,
} from "../../utils/eligibility";

export const POSITION_LABELS: Record<string, string> = {
  C: "Catcher",
  "1B": "First Base",
  "2B": "Second Base",
  SS: "Shortstop",
  "3B": "Third Base",
  MI: "Middle Infield",
  CI: "Corner Infield",
  OF: "Outfield",
  UTIL: "Utility",
  SP: "Starting Pitcher",
  RP: "Relief Pitcher",
  BN: "Bench",
};

export const PLAYER_POOL_OPTIONS = [
  {
    formValue: "Mixed MLB",
    apiValue: "Mixed",
    description: "All players available",
  },
  {
    formValue: "AL-Only",
    apiValue: "AL",
    description: "American League only",
  },
  {
    formValue: "NL-Only",
    apiValue: "NL",
    description: "National League only",
  },
] as const;

export type PlayerPoolFormValue = (typeof PLAYER_POOL_OPTIONS)[number]["formValue"];
export type PlayerPoolApiValue = (typeof PLAYER_POOL_OPTIONS)[number]["apiValue"];

export function poolFormToApi(value: string): PlayerPoolApiValue {
  return (
    PLAYER_POOL_OPTIONS.find((opt) => opt.formValue === value)?.apiValue ?? "Mixed"
  );
}

export function poolApiToForm(value: string): PlayerPoolFormValue {
  return (
    PLAYER_POOL_OPTIONS.find((opt) => opt.apiValue === value)?.formValue ??
    "Mixed MLB"
  );
}

export function extractStatAbbreviation(label: string): string {
  return label.match(/\(([^)]+)\)$/)?.[1] ?? label;
}

export function toLeagueFormPlayer(p: ApiPlayer): Player {
  return {
    id: Number(p.id),
    name: p.name,
    team: p.team,
    pos: p.positions?.join("/") || p.position,
    adp: p.adp,
    value: p.value,
    headshot: p.headshot,
    positions: p.positions,
  };
}

export type KeeperPositionFilter = "ALL" | "C" | "IF" | "OF" | "P";

export function playerMatchesKeeperPositionFilter(
  player: Player,
  filter: KeeperPositionFilter,
): boolean {
  if (filter === "ALL") return true;
  if (filter === "P") {
    return hasPitcherEligibility(player.positions, player.pos);
  }

  const positions = normalizePlayerPositions(player.positions, player.pos);
  if (filter === "OF") return positions.includes("OF");
  if (filter === "IF") {
    return positions.some((pos) =>
      ["1B", "2B", "3B", "SS", "MI", "CI", "IF"].includes(pos),
    );
  }
  return positions.includes(filter);
}

export function keeperDisplayPositions(player: Player): string[] {
  return normalizePlayerPositions(player.positions, player.pos);
}
