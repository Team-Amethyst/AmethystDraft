import { describe, expect, it } from "vitest";
import {
  buildBatterFromSplit,
  buildCatalogOnlyFromBio,
  buildPitcherFromSplit,
  CATALOG_RECOVERY_MLB_IDS,
  filterCatalogPlayersForExport,
  meetsBatterValuationThreshold,
  meetsPitcherValuationThreshold,
  seasonStatSplitFromPerson,
} from "./catalogRosterSupplement";
import type { CatalogBuildContext } from "./catalogRosterSupplement";
import type { PlayerData } from "./playerCatalog";

function emptyCtx(overrides?: Partial<CatalogBuildContext>): CatalogBuildContext {
  return {
    season: 2025,
    bat2Map: new Map(),
    bat3Map: new Map(),
    pit2Map: new Map(),
    pit3Map: new Map(),
    batSpringMap: new Map(),
    pitSpringMap: new Map(),
    posEligibilityMap: new Map(),
    fortyManStatusByPid: new Map(),
    bioMap: new Map(),
    ...overrides,
  };
}

describe("catalogRosterSupplement thresholds", () => {
  it("meets batter threshold at 100 AB", () => {
    expect(meetsBatterValuationThreshold({ atBats: 100 })).toBe(true);
    expect(meetsBatterValuationThreshold({ atBats: 99 })).toBe(false);
  });

  it("meets pitcher threshold at 20 IP or 5 SV", () => {
    expect(meetsPitcherValuationThreshold({ inningsPitched: "20.0" })).toBe(true);
    expect(meetsPitcherValuationThreshold({ inningsPitched: "19.0", saves: 5 })).toBe(
      true,
    );
    expect(meetsPitcherValuationThreshold({ inningsPitched: "10.0", saves: 2 })).toBe(
      false,
    );
  });
});

describe("filterCatalogPlayersForExport", () => {
  const valued: PlayerData = {
    id: "1",
    mlbId: 1,
    name: "Valued",
    team: "NYY",
    position: "OF",
    positions: ["OF"],
    age: 28,
    catalog_rank: 1,
    value: 20,
    catalog_tier: 2,
    catalog_kind: "valuation_eligible",
    valuation_eligible: true,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
  };

  const catalogOnly: PlayerData = {
    ...valued,
    id: "2",
    mlbId: 2,
    name: "Catalog Only",
    value: 0,
    valuation_eligible: false,
  };

  it("keeps valuation-eligible players with positive value", () => {
    expect(filterCatalogPlayersForExport([valued])).toHaveLength(1);
  });

  it("keeps catalog-only rows with zero value", () => {
    expect(filterCatalogPlayersForExport([catalogOnly])).toHaveLength(1);
  });

  it("drops valuation-eligible rows with zero value", () => {
    expect(
      filterCatalogPlayersForExport([
        { ...valued, value: 0, valuation_eligible: true },
      ]),
    ).toHaveLength(0);
  });
});

describe("buildBatterFromSplit / buildPitcherFromSplit", () => {
  it("marks Anthony Volpe–style line as valuation eligible with projections", () => {
    const volpeSplit = {
      player: { id: 683011, fullName: "Anthony Volpe" },
      team: { id: 147, abbreviation: "NYY" },
      position: { abbreviation: "SS" },
      stat: {
        atBats: 539,
        avg: ".247",
        homeRuns: 17,
        rbi: 72,
        runs: 75,
        stolenBases: 20,
        obp: ".310",
        slg: ".395",
      },
    };
    const row = buildBatterFromSplit(volpeSplit, emptyCtx());
    expect(row).not.toBeNull();
    expect(row!.mlbId).toBe(683011);
    expect(row!.valuation_eligible).toBe(true);
    expect(row!.value).toBeGreaterThan(0);
    expect(row!.projection?.batting?.hr).toBeDefined();
  });

  it("builds catalog-only bio row without stats", () => {
    const ctx = emptyCtx({
      bioMap: new Map([
        [
          682987,
          {
            id: 682987,
            fullName: "Spencer Jones",
            primaryPosition: { abbreviation: "OF" },
            currentTeam: { id: 147, abbreviation: "NYY" },
          },
        ],
      ]),
    });
    const row = buildCatalogOnlyFromBio(682987, ctx);
    expect(row?.valuation_eligible).toBe(false);
    expect(row?.value).toBe(0);
    expect(row?.name).toBe("Spencer Jones");
  });
});

describe("seasonStatSplitFromPerson", () => {
  it("extracts hitting split for a season from hydrate payload", () => {
    const split = seasonStatSplitFromPerson(
      {
        id: 683011,
        fullName: "Anthony Volpe",
        stats: [
          {
            group: { displayName: "hitting" },
            splits: [
              {
                season: "2025",
                stat: { atBats: 539 },
                team: { id: 147, abbreviation: "NYY" },
                position: { abbreviation: "SS" },
              },
            ],
          },
        ],
      },
      "hitting",
      2025,
    );
    expect(split?.player.id).toBe(683011);
    expect(split?.stat.atBats).toBe(539);
  });
});

describe("CATALOG_RECOVERY_MLB_IDS", () => {
  it("includes audit target players", () => {
    expect(CATALOG_RECOVERY_MLB_IDS).toContain(683011);
    expect(CATALOG_RECOVERY_MLB_IDS).toContain(701542);
    expect(CATALOG_RECOVERY_MLB_IDS).toContain(682987);
  });
});
