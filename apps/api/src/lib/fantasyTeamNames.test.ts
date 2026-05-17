import { describe, it, expect } from "vitest";
import {
  defaultTeamDisplayNameForIndex,
  fantasyNameForTeamId,
  resolveTeamDisplayNames,
} from "./fantasyTeamNames";

describe("fantasyTeamNames", () => {
  it("uses letter labels for leagues up to 26 teams", () => {
    expect(resolveTeamDisplayNames(9)).toEqual([
      "Team A",
      "Team B",
      "Team C",
      "Team D",
      "Team E",
      "Team F",
      "Team G",
      "Team H",
      "Team I",
    ]);
  });

  it("prefers explicit workbook names", () => {
    expect(resolveTeamDisplayNames(3, ["Alpha", "", "Gamma"])).toEqual([
      "Alpha",
      "Team B",
      "Gamma",
    ]);
  });

  it("maps team_id to display name", () => {
    expect(fantasyNameForTeamId("team_6", 9)).toBe("Team F");
  });

  it("falls back to numeric labels beyond 26 teams", () => {
    expect(defaultTeamDisplayNameForIndex(0, 30)).toBe("Team 1");
  });
});
