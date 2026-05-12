/**
 * Single source for position allocation rows used by My Draft (Target $ / Per Slot)
 * and Command Center team makeup per-slot targets.
 */
export interface PositionPlanRow {
  pos: string;
  slots: number;
  target: number;
}

// TODO(data): Replace with backend-provided roster template + budget targets per position.
export const POSITION_ALLOCATION_PLAN: PositionPlanRow[] = [
  { pos: "C", slots: 1, target: 14 },
  { pos: "1B", slots: 1, target: 28 },
  { pos: "2B", slots: 1, target: 22 },
  { pos: "SS", slots: 1, target: 25 },
  { pos: "3B", slots: 1, target: 24 },
  { pos: "OF", slots: 3, target: 44 },
  { pos: "SP", slots: 2, target: 60 },
  { pos: "RP", slots: 2, target: 20 },
  { pos: "UTIL", slots: 1, target: 15 },
  { pos: "BN", slots: 4, target: 8 },
];

/** Slot count used in My Draft “Per Slot” column for this roster position. */
export function myDraftSlotsForPosition(pos: string): number | undefined {
  return POSITION_ALLOCATION_PLAN.find((r) => r.pos === pos)?.slots;
}

export function defaultTargetForPosition(pos: string): number | undefined {
  return POSITION_ALLOCATION_PLAN.find((r) => r.pos === pos)?.target;
}
