/** Roster row assigned to a minors stash slot (e.g. MIN1). */
export function isMinorRosterSlot(slot: string | undefined): boolean {
  return (slot ?? "").toUpperCase().includes("MIN");
}

/** Roster row assigned to a taxi slot (e.g. TAXI). */
export function isTaxiRosterSlot(slot: string | undefined): boolean {
  return (slot ?? "").toUpperCase().includes("TAXI");
}

/** League `rosterSlots` position key for taxi (excluded from main draft capacity unless present). */
export function isTaxiRosterPositionKey(position: string): boolean {
  return position.toUpperCase().includes("TAXI");
}
