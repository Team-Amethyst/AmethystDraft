import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CATALOG_RECOVERY_MLB_IDS,
  filterCatalogPlayersForExport,
} from "./catalogRosterSupplement";

/**
 * Integration-style test with mocked MLB HTTP to verify 40-man union expands catalog
 * without assigning auction dollars to catalog-only rows.
 */
describe("catalogPlayerFetch 40-man union (mocked MLB)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("includes recovery MLB IDs from 40-man supplement while keeping catalog-only ineligible", async () => {
    const fortyManIds = [...CATALOG_RECOVERY_MLB_IDS, 592450];
    const volpeHitting = {
      atBats: 539,
      avg: ".247",
      homeRuns: 17,
      rbi: 72,
      runs: 75,
      stolenBases: 20,
      obp: ".310",
      slg: ".395",
    };
    const warrenPitching = {
      inningsPitched: "162.1",
      era: "3.80",
      whip: "1.20",
      wins: 12,
      saves: 0,
      strikeOuts: 150,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/roster?rosterType=40Man")) {
        const roster = fortyManIds.map((id) => ({
          person: { id },
          status: { code: "A", description: "Active" },
        }));
        return new Response(JSON.stringify({ roster }), { status: 200 });
      }
      if (url.includes("/stats?") && url.includes("group=hitting") && url.includes("season=2025")) {
        return new Response(
          JSON.stringify({
            stats: [
              {
                splits: [
                  {
                    player: { id: 592450, fullName: "Aaron Judge" },
                    team: { abbreviation: "NYY" },
                    position: { abbreviation: "OF" },
                    stat: {
                      atBats: 541,
                      avg: ".331",
                      homeRuns: 53,
                      rbi: 114,
                      runs: 137,
                      stolenBases: 12,
                      obp: ".457",
                      slg: ".688",
                    },
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/stats?") && url.includes("group=pitching")) {
        return new Response(JSON.stringify({ stats: [{ splits: [] }] }), {
          status: 200,
        });
      }
      if (url.includes("/stats?") && url.includes("group=fielding")) {
        return new Response(JSON.stringify({ stats: [{ splits: [] }] }), {
          status: 200,
        });
      }
      if (url.includes("/people?personIds=") && url.includes("hydrate=stats")) {
        const ids = new URL(url).searchParams.get("personIds")?.split(",") ?? [];
        const people = ids.map((id) => {
          const pid = Number(id);
          if (pid === 683011) {
            return {
              id: pid,
              fullName: "Anthony Volpe",
              stats: [
                {
                  group: { displayName: "hitting" },
                  splits: [
                    {
                      season: "2025",
                      stat: volpeHitting,
                      team: { abbreviation: "NYY" },
                      position: { abbreviation: "SS" },
                    },
                  ],
                },
              ],
            };
          }
          if (pid === 701542) {
            return {
              id: pid,
              fullName: "Will Warren",
              stats: [
                {
                  group: { displayName: "pitching" },
                  splits: [
                    {
                      season: "2025",
                      stat: warrenPitching,
                      team: { abbreviation: "NYY" },
                      position: { abbreviation: "SP" },
                    },
                  ],
                },
              ],
            };
          }
          if (pid === 682987) {
            return {
              id: pid,
              fullName: "Spencer Jones",
              primaryPosition: { abbreviation: "OF" },
              currentTeam: { abbreviation: "NYY" },
              stats: [],
            };
          }
          return {
            id: pid,
            fullName: `Player ${pid}`,
            stats: [],
          };
        });
        return new Response(JSON.stringify({ people }), { status: 200 });
      }
      if (url.includes("/people?personIds=")) {
        const ids = new URL(url).searchParams.get("personIds")?.split(",") ?? [];
        const people = ids.map((id) => ({
          id: Number(id),
          fullName: `Player ${id}`,
          primaryPosition: { abbreviation: "OF" },
          currentTeam: { abbreviation: "NYY" },
        }));
        return new Response(JSON.stringify({ people }), { status: 200 });
      }
      return new Response(JSON.stringify({ stats: [{ splits: [] }] }), {
        status: 200,
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { getOrRefreshCatalogPlayers } = await import("./catalogPlayerFetch");
    const players = await getOrRefreshCatalogPlayers(20);
    const byId = new Map(players.map((p) => [p.mlbId, p]));

    expect(byId.has(683011)).toBe(true);
    expect(byId.get(683011)?.valuation_eligible).toBe(true);
    expect(byId.has(701542)).toBe(true);
    expect(byId.get(701542)?.valuation_eligible).toBe(true);
    expect(byId.has(682987)).toBe(true);
    expect(byId.get(682987)?.valuation_eligible).toBe(false);
    expect(byId.get(682987)?.value).toBe(0);

    const engineEligible = players.filter((p) => p.valuation_eligible);
    expect(engineEligible.every((p) => p.value > 0)).toBe(true);
    expect(engineEligible.some((p) => p.mlbId === 682987)).toBe(false);

    const exportFiltered = filterCatalogPlayersForExport(players);
    expect(exportFiltered.some((p) => p.mlbId === 682987)).toBe(true);
  });
});
