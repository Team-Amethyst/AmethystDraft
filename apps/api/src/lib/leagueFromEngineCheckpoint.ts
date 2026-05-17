/**
 * Maps bundled Engine checkpoint fixtures → persisted League + RosterEntry payloads.
 * Keeps shapes aligned with {@link valuationIncomingSchema} / ENGINE_AGENT_BRIEF.md.
 */

import type { ValuationIncomingParsed } from "../validation/valuationRequestSchema";
import type { ValuationFlatRequest } from "../validation/valuationRequestSchema";
import type { ValuationRequestFixture } from "../validation/valuationRequestSchema";
import { normalizeRosterSlots } from "../validation/valuationRequestSchema";
import { inferMongoPositionsFromCheckpointPick } from "./inferredCheckpointPositions";
import { resolveTeamDisplayNames } from "./fantasyTeamNames";

type FixturePickRow = {
  player_id: string;
  name: string;
  position?: string;
  positions?: string[];
  team?: string;
  team_id: string;
  paid?: number;
  is_keeper?: boolean;
  roster_slot?: string;
  /** Present on some draft_state rows for stable auction pick ordering */
  pick_number?: number;
};

type TeamSection = { team_id: string; players: FixturePickRow[] };

function rosterSlotsRecord(roster_slots: unknown): Record<string, number> {
  const n = normalizeRosterSlots(
    roster_slots as Parameters<typeof normalizeRosterSlots>[0],
  );
  const out: Record<string, number> = {};
  for (const row of n) {
    out[String(row.position)] = Math.max(
      0,
      Math.floor(
        typeof row.count === "number"
          ? row.count
          : Number(row.count as unknown) || 0,
      ),
    );
  }
  return out;
}

function rosterSlotLabel(row: FixturePickRow): string {
  const rs = row.roster_slot?.trim();
  if (rs) return rs;
  return row.positions?.[0] ?? row.position ?? "UTIL";
}

function normalizeTeamId(teamId: string): string {
  const t = teamId.trim();
  const m = /^team_(\d+)$/i.exec(t);
  if (m?.[1]) return `team_${Number.parseInt(m[1], 10)}`;
  return t.startsWith("team_") ? t : `team_${t}`;
}

export type CheckpointRosterInsertRow = {
  externalPlayerId: string;
  playerName: string;
  playerTeam: string;
  positions: string[];
  price: number;
  rosterSlot: string;
  teamId: string;
  isKeeper: boolean;
};

export type CheckpointLeagueExtract = {
  checkpointLabel: string;
  teams: number;
  budget: number;
  rosterSlots: Record<string, number>;
  scoringCategories: { name: string; type: "batting" | "pitching" }[];
  playerPool: "Mixed" | "AL" | "NL";
  scoringFormat?: "5x5" | "6x6" | "points";
  hitterBudgetPct?: number;
  posEligibilityThreshold?: number;
  teamNames: string[];
  deterministic?: boolean;
  seed?: number;
  rosterRows: CheckpointRosterInsertRow[];
};

function isValidAuctionSalary(paid: unknown): paid is number {
  return typeof paid === "number" && Number.isFinite(paid) && paid > 0;
}

function auctionPickPrice(pl: FixturePickRow): number {
  if (!isValidAuctionSalary(pl.paid)) {
    throw new Error(
      `Auction pick "${pl.name}" (${pl.player_id}) has missing or zero salary`,
    );
  }
  return Math.round(pl.paid);
}

function dedupeRows(rows: CheckpointRosterInsertRow[]): CheckpointRosterInsertRow[] {
  const byId = new Map<string, CheckpointRosterInsertRow>();
  for (const r of rows) {
    byId.set(String(r.externalPlayerId).trim(), r);
  }
  return [...byId.values()];
}

function rowsFromSectionsAndDraft(
  keeperSections: TeamSection[],
  draftRows: FixturePickRow[],
): CheckpointRosterInsertRow[] {
  const out: CheckpointRosterInsertRow[] = [];

  for (const section of keeperSections) {
    for (const pl of section.players ?? []) {
      const teamId = normalizeTeamId(pl.team_id || section.team_id);
      const paid = typeof pl.paid === "number" ? pl.paid : 1;
      out.push({
        externalPlayerId: String(pl.player_id).trim(),
        playerName: pl.name,
        playerTeam: pl.team ?? "",
        positions: inferMongoPositionsFromCheckpointPick({
          positions: pl.positions,
          position: pl.position,
          roster_slot: pl.roster_slot,
        }),
        price: Math.max(1, Math.round(Number.isFinite(paid) ? paid : 1)),
        rosterSlot: rosterSlotLabel(pl),
        teamId,
        isKeeper: pl.is_keeper !== false,
      });
    }
  }

  const auctionSorted = [...draftRows].sort(
    (a, b) => (a.pick_number ?? 0) - (b.pick_number ?? 0),
  );

  for (const pl of auctionSorted) {
    if (!isValidAuctionSalary(pl.paid)) continue;
    out.push({
      externalPlayerId: String(pl.player_id).trim(),
      playerName: pl.name,
      playerTeam: pl.team ?? "",
      positions: inferMongoPositionsFromCheckpointPick({
        positions: pl.positions,
        position: pl.position,
        roster_slot: pl.roster_slot,
      }),
      price: auctionPickPrice(pl),
      rosterSlot: rosterSlotLabel(pl),
      teamId: normalizeTeamId(pl.team_id),
      isKeeper: false,
    });
  }

  return dedupeRows(out);
}

function rowsFromReserveSections(
  sections: TeamSection[],
  slotKind: "MIN" | "TAXI",
): CheckpointRosterInsertRow[] {
  const out: CheckpointRosterInsertRow[] = [];
  for (const section of sections) {
    for (const pl of section.players ?? []) {
      const teamId = normalizeTeamId(pl.team_id || section.team_id);
      const slotFromRow = pl.roster_slot?.trim();
      const rosterSlot =
        slotKind === "TAXI"
          ? "TAXI"
          : slotFromRow && slotFromRow.toUpperCase().includes("MIN")
            ? slotFromRow
            : slotFromRow
              ? `MIN${slotFromRow}`
              : "MIN";
      out.push({
        externalPlayerId: String(pl.player_id).trim(),
        playerName: pl.name,
        playerTeam: pl.team ?? "",
        positions: inferMongoPositionsFromCheckpointPick({
          positions: pl.positions,
          position: pl.position,
          roster_slot: rosterSlot,
        }),
        price: 0,
        rosterSlot,
        teamId,
        isKeeper: false,
      });
    }
  }
  return out;
}

function flexiblePreDraft(
  pre: ValuationFlatRequest["pre_draft_rosters"],
): TeamSection[] {
  if (!pre) return [];
  if (Array.isArray(pre)) return pre as TeamSection[];
  const sections: TeamSection[] = [];
  for (const [team_id, players] of Object.entries(pre)) {
    sections.push({ team_id, players: players as FixturePickRow[] });
  }
  return sections;
}

/** Extract Mongo league fields + roster rows from a validated valuation checkpoint union. */
export function extractCheckpointLeagueAndRoster(
  parsed: ValuationIncomingParsed,
): CheckpointLeagueExtract {
  if (parsed.format === "nested") {
    const data = parsed.data as ValuationRequestFixture;
    const { league } = data;
    const rosterSlots = rosterSlotsRecord(league.roster_slots);
    const teams = league.num_teams;
    const teamNames = resolveTeamDisplayNames(teams, league.team_names);
    const keeperSections = (data.pre_draft_rosters ?? []) as TeamSection[];
    const minorsSections = (data.minors ?? []) as TeamSection[];
    const taxiSections = (data.taxi ?? []) as TeamSection[];
    const rosterRows = dedupeRows([
      ...rowsFromSectionsAndDraft(keeperSections, data.draft_state),
      ...rowsFromReserveSections(minorsSections, "MIN"),
      ...rowsFromReserveSections(taxiSections, "TAXI"),
    ]);

    return {
      checkpointLabel: data.checkpoint,
      teams,
      budget: league.total_budget,
      rosterSlots,
      scoringCategories: league.scoring_categories,
      playerPool: league.league_scope,
      scoringFormat: league.scoring_format,
      hitterBudgetPct: league.hitter_budget_pct,
      posEligibilityThreshold: league.pos_eligibility_threshold,
      teamNames,
      deterministic: data.deterministic,
      seed: data.seed,
      rosterRows,
    };
  }

  const flat = parsed.data as ValuationFlatRequest;
  const rosterSlots = rosterSlotsRecord(flat.roster_slots);
  const teams = flat.num_teams;
  const teamNames = resolveTeamDisplayNames(teams, flat.team_names);
  const keeperSections = flexiblePreDraft(flat.pre_draft_rosters);
  const minorsSections = flexiblePreDraft(flat.minors);
  const taxiSections = flexiblePreDraft(flat.taxi);
  const rosterRows = dedupeRows([
    ...rowsFromSectionsAndDraft(keeperSections, flat.drafted_players),
    ...rowsFromReserveSections(minorsSections, "MIN"),
    ...rowsFromReserveSections(taxiSections, "TAXI"),
  ]);

  return {
    checkpointLabel: flat.checkpoint ?? "pre_draft",
    teams,
    budget: flat.total_budget,
    rosterSlots,
    scoringCategories: flat.scoring_categories,
    playerPool: flat.league_scope,
    scoringFormat: flat.scoring_format,
    hitterBudgetPct: flat.hitter_budget_pct,
    posEligibilityThreshold: flat.pos_eligibility_threshold,
    teamNames,
    deterministic: flat.deterministic,
    seed: flat.seed,
    rosterRows,
  };
}
