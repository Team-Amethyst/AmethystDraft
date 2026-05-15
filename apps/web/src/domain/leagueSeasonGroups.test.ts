import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { League } from "../contexts/LeagueContext";
import {
  formatSeasonYearLabel,
  groupLeaguesByFamily,
  importKeepersFromLeagueId,
  leagueSeasonLabel,
  sortLeaguesNewestFirst,
  leagueCurrentSeasonSummary,
  leaguePrimarySeasonMetaLine,
  draftStatusSummaryLabel,
  formatLeagueDraftStatusLabel,
} from "./leagueSeasonGroups";

const __testDir = dirname(fileURLToPath(import.meta.url));
function readSrc(rel: string): string {
  return readFileSync(join(__testDir, rel), "utf8");
}

function L(over: Partial<League> & Pick<League, "id" | "leagueFamilyId" | "seasonYear">): League {
  return {
    name: "Test League",
    commissionerId: "c1",
    memberIds: ["c1"],
    budget: 260,
    hitterBudgetPct: 70,
    teams: 12,
    scoringFormat: "5x5",
    scoringCategories: [],
    rosterSlots: {},
    draftStatus: "pre-draft",
    isPublic: false,
    playerPool: "Mixed",
    teamNames: [],
    posEligibilityThreshold: 20,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  } as League;
}

describe("leagueSeasonGroups", () => {
  it("groupLeaguesByFamily sorts seasons by seasonYear descending within each family", () => {
    const leagues = [
      L({ id: "a", leagueFamilyId: "fam1", seasonYear: 2024 }),
      L({ id: "b", leagueFamilyId: "fam1", seasonYear: 2026 }),
      L({ id: "c", leagueFamilyId: "fam1", seasonYear: 2025 }),
    ];
    const groups = groupLeaguesByFamily(leagues);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.seasons.map((s) => s.league.id)).toEqual(["b", "c", "a"]);
  });

  it("formatSeasonYearLabel uses plain year for newest and archive for older", () => {
    expect(formatSeasonYearLabel(2026, 2026)).toBe("2026");
    expect(formatSeasonYearLabel(2025, 2026)).toBe("2025 archive");
  });

  it("sortLeaguesNewestFirst orders by season year then createdAt", () => {
    const leagues = [
      L({
        id: "old",
        leagueFamilyId: "f",
        seasonYear: 2025,
        createdAt: "2025-06-01T00:00:00.000Z",
      }),
      L({
        id: "newer-year",
        leagueFamilyId: "g",
        seasonYear: 2026,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      L({
        id: "same-year-late",
        leagueFamilyId: "h",
        seasonYear: 2026,
        createdAt: "2026-03-01T00:00:00.000Z",
      }),
    ];
    expect([...leagues].sort(sortLeaguesNewestFirst).map((l) => l.id)).toEqual([
      "same-year-late",
      "newer-year",
      "old",
    ]);
  });

  it("leagueSeasonLabel matches group semantics", () => {
    const leagues = [
      L({ id: "new", leagueFamilyId: "f", seasonYear: 2026 }),
      L({ id: "old", leagueFamilyId: "f", seasonYear: 2025 }),
    ];
    expect(leagueSeasonLabel(leagues[0]!, leagues)).toBe("2026");
    expect(leagueSeasonLabel(leagues[1]!, leagues)).toBe("2025 archive");
  });

  it("grouped output lists every league id once (all ids remain routable)", () => {
    const leagues = [
      L({ id: "x1", leagueFamilyId: "a", seasonYear: 2025 }),
      L({ id: "x2", leagueFamilyId: "a", seasonYear: 2026 }),
      L({ id: "y1", leagueFamilyId: "b", seasonYear: 2024 }),
    ];
    const flat = groupLeaguesByFamily(leagues).flatMap((g) => g.seasons.map((s) => s.league.id));
    expect(new Set(flat).size).toBe(leagues.length);
    expect(flat.sort()).toEqual(["x1", "x2", "y1"].sort());
  });

  it("importKeepersFromLeagueId prefers previousSeasonLeagueId", () => {
    const cur = L({
      id: "new",
      leagueFamilyId: "f",
      seasonYear: 2026,
      previousSeasonLeagueId: "explicit-old",
    });
    const all = [cur, L({ id: "other", leagueFamilyId: "f", seasonYear: 2025 })];
    expect(importKeepersFromLeagueId(cur, all)).toBe("explicit-old");
  });

  it("leaguePrimarySeasonMetaLine omits draft date when unset", () => {
    expect(
      leaguePrimarySeasonMetaLine(
        L({ id: "x", teams: 2, budget: 260, draftStatus: "in-progress" }),
      ),
    ).toBe("2 teams · $260 budget");
  });

  it("leagueCurrentSeasonSummary formats year status teams budget", () => {
    const league = L({
      id: "x",
      leagueFamilyId: "f",
      seasonYear: 2026,
      teams: 12,
      budget: 260,
      draftStatus: "pre-draft",
    });
    expect(leagueCurrentSeasonSummary(league)).toBe(
      "2026 · Pre-draft · 12 teams · $260",
    );
  });

  it("formatLeagueDraftStatusLabel maps draftStatus for My Leagues pills", () => {
    expect(formatLeagueDraftStatusLabel("pre-draft")).toBe("Pre-draft");
    expect(formatLeagueDraftStatusLabel("in-progress")).toBe("In progress");
    expect(formatLeagueDraftStatusLabel("completed")).toBe("Completed");
  });

  it("draftStatusSummaryLabel matches formatLeagueDraftStatusLabel", () => {
    expect(draftStatusSummaryLabel("pre-draft")).toBe("Pre-draft");
    expect(draftStatusSummaryLabel("in-progress")).toBe("In progress");
    expect(draftStatusSummaryLabel("completed")).toBe("Completed");
  });

  it("archive season label and draft status differ between family rows", () => {
    const leagues = [
      L({
        id: "n",
        leagueFamilyId: "f",
        seasonYear: 2026,
        draftStatus: "pre-draft",
      }),
      L({
        id: "o",
        leagueFamilyId: "f",
        seasonYear: 2025,
        draftStatus: "completed",
      }),
    ];
    const g = groupLeaguesByFamily(leagues)[0]!;
    const [cur, arch] = g.seasons;
    expect(cur!.seasonLabel).toBe("2026");
    expect(arch!.seasonLabel).toBe("2025 archive");
    expect(formatLeagueDraftStatusLabel(cur!.league.draftStatus)).toBe(
      "Pre-draft",
    );
    expect(formatLeagueDraftStatusLabel(arch!.league.draftStatus)).toBe(
      "Completed",
    );
    expect(formatLeagueDraftStatusLabel(cur!.league.draftStatus)).not.toBe(
      formatLeagueDraftStatusLabel(arch!.league.draftStatus),
    );
  });

  it("leagues page uses formatLeagueDraftStatusLabel for draftStatus", () => {
    const file = readSrc("../pages/Leagues.tsx");
    expect(file).toContain("formatLeagueDraftStatusLabel");
    expect(file).toContain("formatLeagueDraftStatusLabel(current.draftStatus)");
    expect(file).toContain("formatLeagueDraftStatusLabel(league.draftStatus)");
    expect(file).not.toMatch(/getStatusLabel/);
  });

  it("leagues card status CSS does not force all-caps", () => {
    const css = readSrc("../pages/Leagues.css");
    expect(css).toContain(".league-card-status");
    expect(css).not.toMatch(
      /\.league-card-status\s*\{[^}]*text-transform:\s*uppercase/s,
    );
  });

  it("importKeepersFromLeagueId falls back to newest older same-family season", () => {
    const cur = L({ id: "new", leagueFamilyId: "f", seasonYear: 2026 });
    const old = L({ id: "mid", leagueFamilyId: "f", seasonYear: 2025 });
    const ancient = L({ id: "old", leagueFamilyId: "f", seasonYear: 2024 });
    expect(importKeepersFromLeagueId(cur, [cur, old, ancient])).toBe("mid");
  });

  it("settings sidebar includes keepers tab (no season panel)", () => {
    const file = readSrc("../pages/LeagueSettings.tsx");
    expect(file).toContain('{ id: "setup"');
    expect(file).toContain('{ id: "scoring"');
    expect(file).toContain('{ id: "teams"');
    expect(file).not.toMatch(/\{\s*id:\s*"season"/);
    expect(file).toContain('{ id: "keepers"');
    expect(file).not.toContain("Season management");
    expect(file).not.toContain('className="ls-season-mgmt');
    expect(file).toContain("<LeagueKeepersForm league={league} embedded />");
  });

  it("keepers route redirects to settings keepers tab", () => {
    const routes = readSrc("../routes.tsx");
    expect(routes).toMatch(/path:\s*["']keepers["']/);
    const redirect = readSrc("../pages/LeagueKeepers.tsx");
    expect(redirect).toContain("settings?section=keepers");
  });

  it("my leagues page has no keeper prep shortcut button", () => {
    const file = readSrc("../pages/Leagues.tsx");
    expect(file).not.toContain("Keeper roster prep");
    expect(file).not.toContain("/keepers");
  });

  it("create league step 4 preloads keepers from selected league into editor", () => {
    const file = readSrc("../pages/LeaguesCreate.tsx");
    expect(file).toContain('id="lc-import-keepers-src"');
    expect(file).toContain("keeperImportFromLeagueId");
    expect(file).toContain("includeDraftedPlayers: true");
    expect(file).toContain("getRoster(keeperImportFromLeagueId");
    expect(file).not.toContain("importKeepers(");
    expect(file).toContain("leagueFamilyId");
  });


  it("leagues overview uses one family card layout", () => {
    const file = readSrc("../pages/Leagues.tsx");
    expect(file).toContain("leagues-family-card");
    expect(file).toContain("leagues-archive-list");
  });
});
