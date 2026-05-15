import type { RosterEntry } from "../api/roster";
import type { League } from "../contexts/LeagueContext";
import { availableSlotsForTeamName } from "../pages/command-center-utils/roster";
import { getEligibleSlotsForPositions } from "../utils/eligibility";

export function validateRosterSlotAssignment(
  league: Pick<League, "rosterSlots" | "teamNames">,
  teamName: string,
  positions: string[],
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

  const eligible = getEligibleSlotsForPositions(positions, allSlots);
  if (!eligible.includes(rosterSlot)) {
    return {
      ok: false,
      message: "This player is not eligible for that roster slot.",
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
