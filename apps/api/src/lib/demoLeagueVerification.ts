import { readFileSync, existsSync } from "fs";
import path from "path";
import type {
  ValuationFlatRequest,
  ValuationIncomingParsed,
  ValuationRequestFixture,
} from "../validation/valuationRequestSchema";
import { valuationIncomingSchema } from "../validation/schemas";
import {
  extractCheckpointLeagueAndRoster,
  type CheckpointRosterInsertRow,
} from "./leagueFromEngineCheckpoint";
import {
  DRAFT_CHECKPOINT_FILENAME,
  type EngineCheckpointId,
  isEngineCheckpointId,
} from "./engineCheckpointCatalog";
import {
  DEMO_PRE_DRAFT_GOLDEN,
  fantasyNameForTeamId,
  isReserveRosterSlot,
} from "./demoLeagueFixtureGolden";

export type DemoLeagueStats = {
  source: "fixture" | "mongo";
  leagueId?: string;
  leagueName?: string;
  createdAt?: string;
  teamCount: number;
  keeperCountsByFantasy: Record<string, number>;
  remainingBudgetsByFantasy: Record<string, number>;
  draftPickCountInFixture: number;
  minorsCountsByFantasy: Record<string, number>;
  taxiCountsByFantasy: Record<string, number>;
  activeAuctionSlotCount: number;
  unresolvedSyntheticIds: string[];
};

function countByFantasy(
  predicate: (r: CheckpointRosterInsertRow) => boolean,
  rowsTyped: CheckpointRosterInsertRow[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rowsTyped) {
    if (!predicate(r)) continue;
    const fantasy = fantasyNameForTeamId(r.teamId);
    out[fantasy] = (out[fantasy] ?? 0) + 1;
  }
  return out;
}

export function statsFromCheckpointJson(
  raw: unknown,
  source: "fixture" | "mongo" = "fixture",
): DemoLeagueStats {
  const parsed: ValuationIncomingParsed = valuationIncomingSchema.parse(raw);
  const extracted = extractCheckpointLeagueAndRoster(parsed);

  const budgets =
    parsed.format === "nested"
      ? (parsed.data as ValuationRequestFixture).league.budget_by_team_id ?? {}
      : (parsed.data as ValuationFlatRequest).budget_by_team_id ?? {};

  const keeperCountsByFantasy = countByFantasy(
    (r) => r.isKeeper && !isReserveRosterSlot(r.rosterSlot),
    extracted.rosterRows,
  );
  const minorsCountsByFantasy = countByFantasy(
    (r) => r.rosterSlot.toUpperCase().includes("MIN"),
    extracted.rosterRows,
  );
  const taxiCountsByFantasy = countByFantasy(
    (r) => r.rosterSlot.toUpperCase().includes("TAXI"),
    extracted.rosterRows,
  );

  const remainingBudgetsByFantasy: Record<string, number> = {};
  for (let i = 0; i < extracted.teams; i++) {
    const tid = `team_${i + 1}`;
    const fantasy = fantasyNameForTeamId(tid);
    if (budgets[tid] != null) remainingBudgetsByFantasy[fantasy] = budgets[tid];
  }

  const draft =
    parsed.format === "nested"
      ? parsed.data.draft_state
      : parsed.data.drafted_players;

  const activeAuctionSlotCount = extracted.rosterRows.filter(
    (r) => !r.isKeeper && !isReserveRosterSlot(r.rosterSlot),
  ).length;

  const unresolvedSyntheticIds = [
    ...new Set(
      extracted.rosterRows
        .map((r) => r.externalPlayerId)
        .filter((id) => id.startsWith("fixture_unresolved_")),
    ),
  ].sort();

  return {
    source,
    teamCount: extracted.teams,
    keeperCountsByFantasy,
    remainingBudgetsByFantasy,
    draftPickCountInFixture: Array.isArray(draft) ? draft.length : 0,
    minorsCountsByFantasy,
    taxiCountsByFantasy,
    activeAuctionSlotCount,
    unresolvedSyntheticIds,
  };
}

export function loadCheckpointFixtureJsonById(
  checkpointId: EngineCheckpointId,
  fixturesRoot?: string,
): unknown {
  const root =
    fixturesRoot ??
    path.join(process.cwd(), "test-fixtures", "player-api", "checkpoints");
  const file = path.join(root, DRAFT_CHECKPOINT_FILENAME[checkpointId]);
  if (!existsSync(file)) {
    throw new Error(`${DRAFT_CHECKPOINT_FILENAME[checkpointId]} not found at ${file}`);
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

export function loadPreDraftFixtureJson(fixturesRoot?: string): unknown {
  return loadCheckpointFixtureJsonById("pre_draft", fixturesRoot);
}

export function resolveDemoRefreshCheckpointKey(): EngineCheckpointId {
  const raw = (process.env.DEMO_CHECKPOINT_KEY ?? "pre_draft").trim();
  if (!isEngineCheckpointId(raw)) {
    throw new Error(
      `Invalid DEMO_CHECKPOINT_KEY="${raw}" — expected one of: pre_draft, after_pick_10, …, finished_league`,
    );
  }
  return raw;
}

export function formatDemoLeagueStatsReport(stats: DemoLeagueStats): string {
  const lines = [
    `── Demo league load verification (${stats.source}) ──`,
    stats.leagueName ? `League: ${stats.leagueName}` : "",
    stats.leagueId ? `League id: ${stats.leagueId}` : "",
    stats.createdAt ? `Created: ${stats.createdAt}` : "",
    `Teams: ${stats.teamCount}`,
    `Draft picks in checkpoint file: ${stats.draftPickCountInFixture}`,
    `Active auction roster rows (keepers excluded, reserves excluded): ${stats.activeAuctionSlotCount}`,
    `Unresolved synthetic ids: ${stats.unresolvedSyntheticIds.length}`,
    "",
    "Keeper counts (active, non-reserve):",
    ...Object.entries(stats.keeperCountsByFantasy)
      .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
      .map(([t, n]) => `  ${t}: ${n}`),
    "",
    "Remaining budgets (fixture league.budget_by_team_id):",
    ...Object.entries(stats.remainingBudgetsByFantasy)
      .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
      .map(([t, n]) => `  ${t}: $${n}`),
    "",
    "Minors (reserve slots):",
    ...Object.entries(stats.minorsCountsByFantasy)
      .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
      .map(([t, n]) => `  ${t}: ${n}`),
    "",
    "Taxi (reserve slots):",
    ...Object.entries(stats.taxiCountsByFantasy)
      .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
      .map(([t, n]) => `  ${t}: ${n}`),
  ].filter(Boolean);
  return lines.join("\n");
}

export function assertMatchesGolden(stats: DemoLeagueStats): string[] {
  const errors: string[] = [];
  const g = DEMO_PRE_DRAFT_GOLDEN;

  if (stats.teamCount !== g.teamCount) {
    errors.push(`team count: got ${stats.teamCount}, want ${g.teamCount}`);
  }

  for (const [team, want] of Object.entries(g.keeperCounts)) {
    const got = stats.keeperCountsByFantasy[team] ?? 0;
    if (got !== want) errors.push(`keepers ${team}: got ${got}, want ${want}`);
  }

  for (const [team, want] of Object.entries(g.remainingBudgets)) {
    const got = stats.remainingBudgetsByFantasy[team];
    if (got !== want) {
      errors.push(`budget ${team}: got ${got ?? "?"}, want ${want}`);
    }
  }

  for (const [team, want] of Object.entries(g.minorsCounts)) {
    const got = stats.minorsCountsByFantasy[team] ?? 0;
    if (got !== want) errors.push(`minors ${team}: got ${got}, want ${want}`);
  }

  for (const [team, want] of Object.entries(g.taxiCounts)) {
    const got = stats.taxiCountsByFantasy[team] ?? 0;
    if (got !== want) errors.push(`taxi ${team}: got ${got}, want ${want}`);
  }

  if (stats.activeAuctionSlotCount !== 0) {
    errors.push(
      `pre_draft import should have 0 auction rows, got ${stats.activeAuctionSlotCount}`,
    );
  }

  const zeroKeeperTeams = Object.entries(stats.keeperCountsByFantasy).filter(
    ([, n]) => n === 0,
  );
  if (zeroKeeperTeams.length > 0) {
    errors.push(
      `teams with zero keepers: ${zeroKeeperTeams.map(([t]) => t).join(", ")}`,
    );
  }

  return errors;
}
