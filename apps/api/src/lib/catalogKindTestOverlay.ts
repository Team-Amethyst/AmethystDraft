/**
 * Optional catalog rows for integration tests (Research + Engine payload).
 * Enable with `AMETHYST_CATALOG_KIND_TEST_OVERLAY=1` (e.g. in Vitest).
 */
import type { PlayerData } from "./playerCatalog";

const KIRBY_ID = 669923;

/** George Kirby — `market_only` (Market ADP, no model auction dollars from Engine). */
export const catalogKindTestOverlayMarketOnlyKirby: PlayerData = {
  id: String(KIRBY_ID),
  mlbId: KIRBY_ID,
  catalog_kind: "market_only",
  valuation_eligible: false,
  name: "George Kirby",
  team: "SEA",
  position: "SP",
  positions: ["SP"],
  age: 28,
  catalog_rank: 9998,
  value: 0,
  catalog_tier: 5,
  market_adp: 14,
  headshot: "",
  stats: {
    pitching: {
      era: "3.50",
      whip: "1.10",
      wins: 10,
      saves: 0,
      holds: 0,
      strikeouts: 150,
      innings: "150.0",
      completeGames: 0,
    },
  },
  projection: {},
  outlook: "",
};

/** Roster-context-only row — excluded from Research by default. */
export const catalogKindTestOverlayRosterContext: PlayerData = {
  id: "999001",
  mlbId: 999001,
  catalog_kind: "roster_context",
  valuation_eligible: false,
  name: "Fixture Roster Context",
  team: "SEA",
  position: "RP",
  positions: ["RP"],
  age: 24,
  catalog_rank: 9999,
  value: 0,
  catalog_tier: 5,
  headshot: "",
  stats: {},
  projection: {},
  outlook: "",
};

const OVERLAY_ROWS: PlayerData[] = [
  catalogKindTestOverlayMarketOnlyKirby,
  catalogKindTestOverlayRosterContext,
];

export function appendCatalogKindTestOverlay(players: PlayerData[]): PlayerData[] {
  if (process.env.AMETHYST_CATALOG_KIND_TEST_OVERLAY !== "1") {
    return players;
  }
  const existing = new Set(players.map((p) => p.id));
  const extra = OVERLAY_ROWS.filter((p) => !existing.has(p.id));
  return [...players, ...extra];
}
