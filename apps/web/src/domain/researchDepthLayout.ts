import type {
  DepthChartPosition,
  DepthChartResponse,
} from "../api/players";

/** Default team in depth-chart selector (NYY). */
export const DEFAULT_RESEARCH_DEPTH_TEAM_ID = 147;

/** Column order for depth-chart grid (must match API position keys). */
export const RESEARCH_DEPTH_POSITIONS: readonly DepthChartPosition[] = [
  "SP",
  "RP",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
  "DH",
];

/** Slots shown per position (starter / backup / reserve). */
export const RESEARCH_DEPTH_RANKS_PER_POSITION = 3;

export function researchDepthSlotCapacity(
  positionCount = RESEARCH_DEPTH_POSITIONS.length,
  ranksPerPosition = RESEARCH_DEPTH_RANKS_PER_POSITION,
): number {
  return positionCount * ranksPerPosition;
}

export function countDepthChartAssignments(
  data: DepthChartResponse,
  positions: readonly DepthChartPosition[] = RESEARCH_DEPTH_POSITIONS,
): number {
  return positions.reduce(
    (total, position) => total + (data.positions[position]?.length ?? 0),
    0,
  );
}
