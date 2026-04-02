import { describe, expect, it } from "vitest";
import {
  assignTier,
  calcBatterValue,
  calcPitcherValue,
  projectBatting,
  projectPitching,
} from "./playerScoring";

describe("assignTier", () => {
  it("maps value thresholds to expected tiers", () => {
    expect(assignTier(45)).toBe(1);
    expect(assignTier(30)).toBe(2);
    expect(assignTier(20)).toBe(3);
    expect(assignTier(8)).toBe(4);
    expect(assignTier(2)).toBe(5);
  });
});

describe("calcBatterValue", () => {
  it("returns zero when at-bats are below threshold", () => {
    expect(calcBatterValue({ atBats: 99, avg: ".280" })).toBe(0);
  });

  it("returns positive value for qualified batters", () => {
    const value = calcBatterValue({
      atBats: 600,
      avg: ".285",
      homeRuns: 30,
      rbi: 95,
      runs: 100,
      stolenBases: 20,
    });
    expect(value).toBeGreaterThan(0);
  });
});

describe("calcPitcherValue", () => {
  it("returns zero for low-volume low-save relievers", () => {
    expect(calcPitcherValue({ inningsPitched: "12", saves: 0 })).toBe(0);
  });

  it("returns positive value for qualified pitchers", () => {
    const value = calcPitcherValue({
      inningsPitched: "180",
      era: "3.40",
      whip: "1.12",
      strikeOuts: 210,
      wins: 15,
      saves: 0,
    });
    expect(value).toBeGreaterThan(0);
  });
});

describe("projection helpers", () => {
  it("projects batting with weighted averaging", () => {
    const projected = projectBatting(
      { atBats: 500, hits: 140, homeRuns: 25, rbi: 90, runs: 85, stolenBases: 12 },
      { atBats: 450, hits: 120, homeRuns: 20, rbi: 75, runs: 70, stolenBases: 10 },
      { atBats: 420, hits: 110, homeRuns: 18, rbi: 65, runs: 62, stolenBases: 8 },
    );

    expect(projected.hr).toBeGreaterThanOrEqual(20);
    expect(projected.rbi).toBeGreaterThanOrEqual(70);
    expect(projected.avg).toMatch(/^\d\.\d{3}$/);
  });

  it("projects pitching with innings and rate outputs", () => {
    const projected = projectPitching(
      {
        inningsPitched: "170",
        earnedRuns: 64,
        hits: 150,
        baseOnBalls: 45,
        strikeOuts: 190,
        wins: 12,
        saves: 0,
        holds: 0,
        completeGames: 1,
      },
      {
        inningsPitched: "155",
        earnedRuns: 68,
        hits: 145,
        baseOnBalls: 50,
        strikeOuts: 175,
        wins: 10,
        saves: 0,
        holds: 0,
        completeGames: 0,
      },
    );

    expect(projected.innings).toBeGreaterThan(100);
    expect(projected.era).toMatch(/^\d+\.\d{2}$/);
    expect(projected.whip).toMatch(/^\d+\.\d{2}$/);
  });
});
