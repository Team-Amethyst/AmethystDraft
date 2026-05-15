import type { League } from "../contexts/LeagueContext";

/** Stable family key (matches API fallback when `leagueFamilyId` was missing on legacy rows). */
export function effectiveLeagueFamilyId(
  league: Pick<League, "id" | "leagueFamilyId">,
): string {
  const raw = typeof league.leagueFamilyId === "string" ? league.leagueFamilyId.trim() : "";
  return raw || league.id;
}

export function effectiveSeasonYear(
  league: Pick<League, "seasonYear" | "createdAt">,
): number {
  if (typeof league.seasonYear === "number" && Number.isFinite(league.seasonYear)) {
    return Math.floor(league.seasonYear);
  }
  const d = new Date(league.createdAt);
  return Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
}

/** Newest year in family → `"2026"`; older → `"2025 archive"`. */
export function formatSeasonYearLabel(seasonYear: number, newestYearInFamily: number): string {
  const y = Math.floor(seasonYear);
  const max = Math.floor(newestYearInFamily);
  return y >= max ? String(y) : `${y} archive`;
}

/** Human-readable draft phase for UI (from `League.draftStatus`). */
export function formatLeagueDraftStatusLabel(
  draftStatus: League["draftStatus"],
): string {
  switch (draftStatus) {
    case "pre-draft":
      return "Pre-draft";
    case "in-progress":
      return "In progress";
    case "completed":
      return "Completed";
    default:
      return String(draftStatus);
  }
}

/** Same labels as `formatLeagueDraftStatusLabel` (used in season summary copy). */
export const draftStatusSummaryLabel = formatLeagueDraftStatusLabel;

/**
 * One-line summary for the newest season row in a family, e.g.
 * `2026 · Pre-draft · 12 teams · $260`.
 */
export function leagueCurrentSeasonSummary(league: League): string {
  const y = effectiveSeasonYear(league);
  const status = draftStatusSummaryLabel(league.draftStatus);
  return `${y} · ${status} · ${league.teams} teams · $${league.budget}`;
}

export type LeagueSeasonRow = {
  league: League;
  seasonLabel: string;
  isNewestInFamily: boolean;
};

export type LeagueFamilyGroup = {
  leagueFamilyId: string;
  /** Name from the newest season row in the family (for section heading). */
  displayName: string;
  seasons: LeagueSeasonRow[];
};

function sortLeaguesSeasonDesc(a: League, b: League): number {
  return effectiveSeasonYear(b) - effectiveSeasonYear(a);
}

/**
 * Group leagues by family, sort each family by `seasonYear` descending,
 * and mark the newest row + human-readable labels.
 */
export function groupLeaguesByFamily(leagues: League[]): LeagueFamilyGroup[] {
  const byFamily = new Map<string, League[]>();
  for (const league of leagues) {
    const fid = effectiveLeagueFamilyId(league);
    const list = byFamily.get(fid);
    if (list) list.push(league);
    else byFamily.set(fid, [league]);
  }

  const groups: LeagueFamilyGroup[] = [];
  for (const [leagueFamilyId, members] of byFamily) {
    const sorted = [...members].sort(sortLeaguesSeasonDesc);
    const newestYear = effectiveSeasonYear(sorted[0]!);
    const displayName = sorted[0]!.name;
    const seasons: LeagueSeasonRow[] = sorted.map((league, index) => ({
      league,
      seasonLabel: formatSeasonYearLabel(effectiveSeasonYear(league), newestYear),
      isNewestInFamily: index === 0,
    }));
    groups.push({ leagueFamilyId, displayName, seasons });
  }

  groups.sort((a, b) => {
    const ay = effectiveSeasonYear(a.seasons[0]!.league);
    const byy = effectiveSeasonYear(b.seasons[0]!.league);
    if (ay !== byy) return byy - ay;
    return a.displayName.localeCompare(b.displayName);
  });

  return groups;
}

/** Season label for a league given the full list (navbar / inline). */
export function leagueSeasonLabel(league: League, allLeagues: League[]): string {
  const fid = effectiveLeagueFamilyId(league);
  const family = allLeagues.filter((l) => effectiveLeagueFamilyId(l) === fid);
  if (family.length === 0) return String(effectiveSeasonYear(league));
  const newestYear = Math.max(...family.map((l) => effectiveSeasonYear(l)));
  return formatSeasonYearLabel(effectiveSeasonYear(league), newestYear);
}

/**
 * `fromLeagueId` for POST import-keepers: explicit chain link, else newest older same-family season.
 */
export function importKeepersFromLeagueId(
  league: League,
  allLeagues: League[],
): string | null {
  if (league.previousSeasonLeagueId?.trim()) {
    return league.previousSeasonLeagueId.trim();
  }
  const mine = effectiveSeasonYear(league);
  const fid = effectiveLeagueFamilyId(league);
  const older = allLeagues
    .filter(
      (x) =>
        effectiveLeagueFamilyId(x) === fid &&
        x.id !== league.id &&
        effectiveSeasonYear(x) < mine,
    )
    .sort((a, b) => effectiveSeasonYear(b) - effectiveSeasonYear(a));
  return older[0]?.id ?? null;
}
