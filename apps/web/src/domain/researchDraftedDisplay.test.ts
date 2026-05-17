import { describe, it, expect } from "vitest";
import type { Player } from "../types/player";
import {
  researchTableAuctionDollars,
  resolveResearchDraftedRowDisplay,
} from "./researchDraftedDisplay";

function player(partial: Partial<Player> & { id: string }): Player {
  return {
    id: partial.id,
    mlbId: 1,
    name: partial.name ?? partial.id,
    team: "SEA",
    position: "OF",
    age: 28,
    catalog_rank: 1,
    catalog_tier: 1,
    value: 1,
    headshot: "",
    stats: {},
    valuation_eligible: false,
    ...partial,
  } as Player;
}

describe("resolveResearchDraftedRowDisplay", () => {
  it("returns team and formatted price for drafted players", () => {
    const display = resolveResearchDraftedRowDisplay(
      player({ id: "sold", name: "Sold Player" }),
      new Set(["sold"]),
      new Map([["sold", "Team A"]]),
      new Map([["sold", 16]]),
    );
    expect(display).toEqual({
      teamName: "Team A",
      formattedPrice: "$16",
      title: "Drafted by Team A for $16 (not our valuation)",
    });
  });

  it("uses price paid as auction dollars for drafted players", () => {
    expect(
      researchTableAuctionDollars(
        player({
          id: "sold",
          auction_value: 40,
          valuation_eligible: true,
        }),
        {
          draftedIds: new Set(["sold"]),
          draftedPriceByPlayerId: new Map([["sold", 16]]),
        },
      ),
    ).toBe(16);
  });

  it("returns null when player is not drafted", () => {
    expect(
      resolveResearchDraftedRowDisplay(
        player({ id: "free" }),
        new Set(["sold"]),
        new Map(),
        new Map(),
      ),
    ).toBeNull();
  });
});
