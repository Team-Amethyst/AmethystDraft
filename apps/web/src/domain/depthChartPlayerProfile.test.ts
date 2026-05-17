import { describe, expect, it } from "vitest";
import {
  buildDepthChartStubPlayer,
  depthChartModalContextFromRow,
} from "./depthChartPlayerProfile";
import type { DepthChartPlayerRow } from "../api/players";

const slot: DepthChartPlayerRow = {
  rank: 2,
  playerId: 999888,
  playerName: "Test Prospect",
  primaryPosition: "SS",
  status: "Active",
  usageStarts: 0,
  usageAppearances: 2,
  outOfPosition: false,
  needsManualReview: false,
  reasons: [],
};

describe("buildDepthChartStubPlayer", () => {
  it("builds a visible catalog-shaped player without valuation eligibility", () => {
    const p = buildDepthChartStubPlayer(slot, "NYY");
    expect(p.id).toBe("999888");
    expect(p.mlbId).toBe(999888);
    expect(p.name).toBe("Test Prospect");
    expect(p.team).toBe("NYY");
    expect(p.position).toBe("SS");
    expect(p.valuation_eligible).toBe(false);
  });
});

describe("depthChartModalContextFromRow", () => {
  it("captures depth rank and chart position", () => {
    expect(depthChartModalContextFromRow(slot, "SS")).toEqual({
      depthRank: 2,
      chartPosition: "SS",
      status: "Active",
    });
  });
});
