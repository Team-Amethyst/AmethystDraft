import type { RosterEntry } from "../api/roster";
import type { League } from "../contexts/LeagueContext";
import { availableSlotsForTeamName } from "../pages/command-center-utils/roster";

/**
 * Validates that a roster slot exists on the league and still has capacity for the team.
 * Position eligibility is intentionally not enforced here: Command Center and draft log
 * UIs allow commissioner-style overrides (see RosterSlotPicker ineligible options), and
 * the API accepts any configured slot string.
 */
export function validateRosterSlotAssignment(
  league: Pick<League, "rosterSlots" | "teamNames">,
  teamName: string,
  _positions: string[],
  rosterSlot: string,
  roster: RosterEntry[],
  excludeEntryId?: string,
): { ok: true } | { ok: false; message: string } {
  const allSlots = Object.keys(league.rosterSlots);
  if (!allSlots.includes(rosterSlot)) {
    return {
      ok: false,
      message: "That roster slot is not configured for this league.",
    };
  }

  const rosterForCapacity = excludeEntryId
    ? roster.filter((e) => e._id !== excludeEntryId)
    : roster;
  const available = availableSlotsForTeamName(
    league as League,
    teamName,
    allSlots,
    rosterForCapacity,
  );
  if (!available.has(rosterSlot)) {
    return {
      ok: false,
      message: "That roster slot is already full for this team.",
    };
  }

  return { ok: true };
}
