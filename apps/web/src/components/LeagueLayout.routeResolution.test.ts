import { describe, it, expect } from "vitest";
import type { League } from "../contexts/LeagueContext";

/** Same rule as `LeagueLayout`: `league = allLeagues.find((l) => l.id === id) ?? null`. */
function pickLeagueForRoute(allLeagues: League[], routeId: string): League | null {
  return allLeagues.find((l) => l.id === routeId) ?? null;
}

describe("LeagueLayout route resolution", () => {
  it("resolves an older season id when a newer season exists in allLeagues", () => {
    const old = { id: "oldseason", seasonYear: 2024, leagueFamilyId: "fam" } as League;
    const newer = { id: "newseason", seasonYear: 2025, leagueFamilyId: "fam" } as League;
    const all = [newer, old];
    expect(pickLeagueForRoute(all, "oldseason")).toBe(old);
    expect(pickLeagueForRoute(all, "newseason")).toBe(newer);
  });

  it("returns null for unknown id", () => {
    expect(pickLeagueForRoute([], "x")).toBeNull();
  });
});
