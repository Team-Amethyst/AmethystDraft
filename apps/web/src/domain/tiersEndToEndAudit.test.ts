import { describe, expect, it } from "vitest";
import type { Player } from "../types/player";
import {
  classifyTierPlayer,
  formatTiersAuditReportForConsole,
  runTiersEndToEndAudit,
} from "./tiersEndToEndAudit";

function p(partial: Partial<Player> & { id: string }): Player {
  return {
    id: partial.id,
    mlbId: 1,
    name: partial.name ?? partial.id,
    team: "SEA",
    position: partial.position ?? "OF",
    age: 28,
    catalog_rank: 50,
    catalog_tier: partial.catalog_tier ?? 3,
    value: 1,
    headshot: "",
    stats: {},
    ...partial,
  } as Player;
}

describe("tiersEndToEndAudit", () => {
  it("classifies available valued vs catalog-only", () => {
    expect(
      classifyTierPlayer(
        p({ id: "a", auction_value: 16, auction_tier: 1 }),
        new Set(),
      ),
    ).toBe("A_available_valued");
    expect(
      classifyTierPlayer(
        p({
          id: "b",
          valuation_eligible: false,
          auction_value: undefined as unknown as number,
        }),
        new Set(),
      ),
    ).toBe("D_catalog_no_value");
  });

  it("flags catalog-only in main tiers after partition fix", () => {
    const players = [
      p({ id: "v1", auction_tier: 1, auction_value: 17.2, auction_rank: 1 }),
      p({ id: "v2", auction_tier: 1, auction_value: 16.4, auction_rank: 2 }),
      p({
        id: "cat",
        catalog_tier: 2,
        valuation_eligible: false,
        auction_value: undefined as unknown as number,
      }),
      p({
        id: "sold",
        name: "Sold Star",
        auction_tier: 1,
        valuation_eligible: false,
        auction_value: undefined as unknown as number,
      }),
    ];
    const report = runTiersEndToEndAudit({
      players,
      draftedIds: new Set(["sold"]),
      draftedByTeam: new Map([["sold", "Team A"]]),
      draftedPriceByPlayerId: new Map([["sold", 16]]),
    });
    expect(report.contaminatedRows.length).toBe(0);
    expect(report.classCounts.D_catalog_no_value).toBe(1);
    expect(report.draftedHandling.violations).toHaveLength(0);
    expect(formatTiersAuditReportForConsole(report)).toContain("Classification:");
  });

  it("detects flat boundaries in mid-teens cluster", () => {
    const players = Array.from({ length: 12 }, (_, i) =>
      p({
        id: `t1-${i}`,
        auction_tier: 1,
        auction_value: 17 - i * 0.15,
        auction_rank: i + 1,
      }),
    ).concat(
      Array.from({ length: 10 }, (_, i) =>
        p({
          id: `t2-${i}`,
          auction_tier: 2,
          auction_value: 14 - i * 0.2,
          auction_rank: 20 + i,
        }),
      ),
    );
    const report = runTiersEndToEndAudit({ players, draftedIds: new Set() });
    expect(report.tierSummaries[0]?.displayMax - report.tierSummaries[0]?.displayMin).toBeLessThanOrEqual(
      2,
    );
    expect(
      ["D_tier_boundary_issue", "B_mostly_correct_ui", "A_correct"].includes(
        report.classification,
      ),
    ).toBe(true);
  });
});
