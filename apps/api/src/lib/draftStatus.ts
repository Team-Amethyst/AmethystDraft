import type { ILeague, DraftStatus } from "../models/League";
import type { IRosterEntry } from "../models/RosterEntry";
import League from "../models/League";
import RosterEntry from "../models/RosterEntry";
import {
  isMinorRosterSlot,
  isTaxiRosterSlot,
  isTaxiRosterPositionKey,
} from "./rosterSlotKind";
import { normalizeRosterSlots } from "../validation/valuationRequestSchema";

/** Rows that occupy a main-draft roster spot (keepers, auction picks, normal slots). */
export function isMainRosterEntry(entry: Pick<IRosterEntry, "rosterSlot">): boolean {
  return !isMinorRosterSlot(entry.rosterSlot) && !isTaxiRosterSlot(entry.rosterSlot);
}

export function resolveLeagueNumTeams(league: Pick<ILeague, "teams" | "teamNames" | "memberIds">): number {
  const explicit = Number(league.teams);
  if (Number.isFinite(explicit) && explicit >= 2) {
    return Math.floor(explicit);
  }
  const nameLen = Array.isArray(league.teamNames) ? league.teamNames.length : 0;
  if (nameLen >= 2) return nameLen;
  const memberLen = league.memberIds?.length ?? 0;
  if (memberLen >= 2) return memberLen;
  return 12;
}

/** Main-draft slot capacity for one team (sum of rosterSlots counts, excluding taxi position keys). */
export function mainRosterSlotCapacityPerTeam(league: Pick<ILeague, "rosterSlots">): number {
  const raw = league.rosterSlots as unknown;
  if (raw == null || typeof raw !== "object") return 0;
  const rows = normalizeRosterSlots(
    raw as Parameters<typeof normalizeRosterSlots>[0],
  );
  return rows
    .filter((row) => !isTaxiRosterPositionKey(String(row.position)))
    .reduce(
      (sum, row) =>
        sum +
        Math.max(
          0,
          Math.floor(
            typeof row.count === "number"
              ? row.count
              : Number(row.count as unknown) || 0,
          ),
        ),
      0,
    );
}

export function requiredMainRosterSpots(league: Pick<ILeague, "rosterSlots" | "teams" | "teamNames" | "memberIds">): number {
  return mainRosterSlotCapacityPerTeam(league) * resolveLeagueNumTeams(league);
}

export function countFilledMainRosterSpots(
  entries: Pick<IRosterEntry, "rosterSlot">[],
): number {
  return entries.filter(isMainRosterEntry).length;
}

export function hasNonKeeperMainDraftPick(
  entries: Pick<IRosterEntry, "isKeeper" | "rosterSlot">[],
): boolean {
  return entries.some((e) => !e.isKeeper && isMainRosterEntry(e));
}

/**
 * Derives draft phase from league settings and roster rows.
 * Completed leagues stay completed (no automatic reopen on roster edits).
 */
export function computeDraftStatusForLeague(
  league: Pick<ILeague, "draftStatus" | "rosterSlots" | "teams" | "teamNames" | "memberIds">,
  rosterEntries: Pick<IRosterEntry, "isKeeper" | "rosterSlot">[],
): DraftStatus {
  if (league.draftStatus === "completed") {
    return "completed";
  }

  if (!hasNonKeeperMainDraftPick(rosterEntries)) {
    return "pre-draft";
  }

  const required = requiredMainRosterSpots(league);
  const filled = countFilledMainRosterSpots(rosterEntries);
  if (required > 0 && filled >= required) {
    return "completed";
  }

  return "in-progress";
}

/** Recompute and persist `draftStatus` after roster mutations. */
export async function syncLeagueDraftStatus(
  leagueId: string | import("mongoose").Types.ObjectId,
): Promise<DraftStatus | null> {
  const league = await League.findById(leagueId);
  if (!league) return null;

  const entries = await RosterEntry.find({ leagueId: league._id }).lean();
  const next = computeDraftStatusForLeague(league, entries);

  if (league.draftStatus !== next) {
    league.draftStatus = next;
    await league.save();
  }

  return next;
}
