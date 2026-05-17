/**
 * Map checkpoint JSON → Create League wizard fields (step 1–3 oriented).
 */

import type { RosterSlot } from "../../types/league";
import {
  rosterDefaults,
  hittingStats,
  pitchingStats,
} from "../../types/league";
import { alignTeamNamesForCheckpoint } from "../../domain/checkpointMockDraft";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function poolUi(scope: string): "Mixed MLB" | "AL-Only" | "NL-Only" {
  if (scope === "AL") return "AL-Only";
  if (scope === "NL") return "NL-Only";
  return "Mixed MLB";
}

function rosterSlotsRecordFromUnknown(
  roster_slots: unknown,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (Array.isArray(roster_slots)) {
    for (const row of roster_slots) {
      if (!isRecord(row)) continue;
      const pos = row.position;
      const count = row.count;
      if (typeof pos === "string" && typeof count === "number") {
        out[pos] = count;
      }
    }
    return out;
  }
  if (typeof roster_slots === "object" && roster_slots !== null) {
    for (const [k, v] of Object.entries(roster_slots as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        out[k] = Math.floor(v);
      }
    }
  }
  return out;
}

function rosterSlotsFromRecord(rec: Record<string, number>): RosterSlot[] {
  return rosterDefaults.map((d) => ({
    position: d.position,
    count: Math.max(0, Math.floor(rec[d.position] ?? d.count)),
  }));
}

type ScoringCat = { name: string; type: "batting" | "pitching" };

function statLabel(cat: {
  name: string;
  type: "batting" | "pitching";
}): string | null {
  const pool = cat.type === "batting" ? hittingStats : pitchingStats;
  const abbr = cat.name.trim().toUpperCase();
  const hit = pool.find((lbl) => {
    const m = /\(([A-Z]+)\)/.exec(lbl);
    return m?.[1] === abbr;
  });
  return hit ?? null;
}

export type CheckpointWizardPreset = {
  suggestedName: string;
  teams: number;
  budget: number;
  posEligibilityThreshold: number;
  playerPool: "Mixed MLB" | "AL-Only" | "NL-Only";
  rosterSlots: RosterSlot[];
  hitting: string[];
  pitching: string[];
  teamDisplayNames: string[];
};

export function buildWizardPresetFromCheckpointJson(
  checkpointJson: unknown,
  checkpointKey: string,
): CheckpointWizardPreset | { error: string } {
  if (!isRecord(checkpointJson)) {
    return { error: "Invalid checkpoint JSON" };
  }

  let scoring: ScoringCat[];
  let teams: number;
  let budget: number;
  let rosterRec: Record<string, number>;
  let poolScope: string;
  let posThresh = 20;
  let teamNamesFromFixture: string[] = [];

  if (checkpointJson.league != null && isRecord(checkpointJson.league)) {
    const league = checkpointJson.league as Record<string, unknown>;
    if (Array.isArray(league.team_names)) {
      teamNamesFromFixture = league.team_names.filter(
        (n): n is string => typeof n === "string" && n.trim().length > 0,
      );
    }
    scoring = Array.isArray(league.scoring_categories)
      ? (league.scoring_categories as ScoringCat[])
      : [];
    teams = typeof league.num_teams === "number" ? league.num_teams : 12;
    budget =
      typeof league.total_budget === "number" ? league.total_budget : 260;
    rosterRec = rosterSlotsRecordFromUnknown(league.roster_slots);
    poolScope =
      typeof league.league_scope === "string" ? league.league_scope : "Mixed";
    posThresh =
      typeof league.pos_eligibility_threshold === "number"
        ? league.pos_eligibility_threshold
        : 20;
  } else if (Array.isArray(checkpointJson.drafted_players)) {
    scoring = Array.isArray(checkpointJson.scoring_categories)
      ? (checkpointJson.scoring_categories as ScoringCat[])
      : [];
    teams =
      typeof checkpointJson.num_teams === "number"
        ? checkpointJson.num_teams
        : 12;
    budget =
      typeof checkpointJson.total_budget === "number"
        ? checkpointJson.total_budget
        : 260;
    rosterRec = rosterSlotsRecordFromUnknown(checkpointJson.roster_slots);
    poolScope =
      typeof checkpointJson.league_scope === "string"
        ? checkpointJson.league_scope
        : "Mixed";
    posThresh =
      typeof checkpointJson.pos_eligibility_threshold === "number"
        ? checkpointJson.pos_eligibility_threshold
        : 20;
    if (Array.isArray(checkpointJson.team_names)) {
      teamNamesFromFixture = checkpointJson.team_names.filter(
        (n): n is string => typeof n === "string" && n.trim().length > 0,
      );
    }
  } else {
    return {
      error:
        "Unsupported checkpoint shape (expected nested league or flat valuation body)",
    };
  }

  const hitting: string[] = [];
  const pitching: string[] = [];
  for (const cat of scoring) {
    if (!cat?.name || !cat?.type) continue;
    const lbl = statLabel(cat);
    if (!lbl) continue;
    if (cat.type === "batting") hitting.push(lbl);
    else pitching.push(lbl);
  }

  const teamDisplayNames = alignTeamNamesForCheckpoint(
    teamNamesFromFixture,
    teams,
  );

  return {
    suggestedName: `[Preset] ${checkpointKey.replace(/_/g, " ")}`,
    teams,
    budget,
    posEligibilityThreshold: Math.max(1, Math.floor(posThresh)),
    playerPool: poolUi(poolScope),
    rosterSlots: rosterSlotsFromRecord(rosterRec),
    hitting,
    pitching,
    teamDisplayNames,
  };
}
