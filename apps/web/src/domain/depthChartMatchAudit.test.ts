import { describe, it, expect } from "vitest";
import type { DepthChartResponse } from "../api/players";
import { auditDepthChartTeam } from "./depthChartMatchAudit";

describe("depthChartMatchAudit", () => {
  it("builds summary line and examples by state", () => {
    const chart: DepthChartResponse = {
      teamId: 147,
      generatedAt: new Date().toISOString(),
      season: 2026,
      rosterCount: 26,
      rosterLimit: 26,
      positions: {
        SP: [
          {
            rank: 1,
            playerId: 1,
            playerName: "A",
            primaryPosition: "P",
            status: "Active",
            usageStarts: 0,
            usageAppearances: 0,
            outOfPosition: false,
            needsManualReview: false,
            reasons: [],
          },
        ],
        RP: [],
        C: [],
        "1B": [],
        "2B": [],
        "3B": [],
        SS: [],
        LF: [],
        CF: [],
        RF: [],
        DH: [],
      },
      manualReview: [],
      constraints: { rosterLimitRespected: true, note: "OK" },
    };

    const audit = auditDepthChartTeam(chart, "NYY", [], [], [], new Map());
    expect(audit.summaryLine).toContain("1 assignments");
    expect(audit.summary.depthOnly).toBe(1);
    expect(audit.examplesByState.depth_only?.length).toBe(1);
  });
});
