import { describe, expect, it } from "vitest";
import {
  attachResearchDraftableFlags,
  filterPlayersByResearchDraftablePool,
  isNearMinimumAuctionBid,
  normalizeDraftablePoolMeta,
  researchDraftableStateForPlayer,
  shouldShowOutsideDraftableMinBidTooltip,
  TOOLTIP_OUTSIDE_DRAFTABLE_MIN_BID,
} from "./draftablePoolSemantics";

describe("normalizeDraftablePoolMeta", () => {
  it("returns valid meta when ids array is coherent", () => {
    const m = normalizeDraftablePoolMeta({
      draftable_player_ids: ["1", "2", "3"],
      draftable_pool_size: 3,
    });
    expect(m.kind).toBe("valid");
    if (m.kind === "valid") {
      expect(m.draftableIds.has("1")).toBe(true);
      expect(m.draftableIds.has("4")).toBe(false);
      expect(m.poolSize).toBe(3);
    }
  });

  it("accepts numeric ids in array", () => {
    const m = normalizeDraftablePoolMeta({
      draftable_player_ids: [670541, 547180],
      draftable_pool_size: 2,
    });
    expect(m.kind).toBe("valid");
    if (m.kind === "valid") {
      expect(m.draftableIds.has("670541")).toBe(true);
      expect(m.draftableIds.has("547180")).toBe(true);
    }
  });

  it("returns unknown when ids missing", () => {
    expect(normalizeDraftablePoolMeta({ draftable_pool_size: 5 }).kind).toBe(
      "unknown",
    );
  });

  it("returns unknown when pool size mismatches id count", () => {
    expect(
      normalizeDraftablePoolMeta({
        draftable_player_ids: ["a", "b"],
        draftable_pool_size: 99,
      }).kind,
    ).toBe("unknown");
  });

  it("returns unknown for empty id array", () => {
    expect(
      normalizeDraftablePoolMeta({ draftable_player_ids: [] }).kind,
    ).toBe("unknown");
  });
});

describe("researchDraftableStateForPlayer", () => {
  const meta = normalizeDraftablePoolMeta({
    draftable_player_ids: ["10", "20"],
    draftable_pool_size: 2,
  });
  if (meta.kind !== "valid") throw new Error("fixture");

  it("marks in-pool catalog player draftable", () => {
    expect(
      researchDraftableStateForPlayer(
        meta,
        { id: "10", valuation_eligible: true },
        false,
      ),
    ).toBe("draftable");
  });

  it("marks out-of-pool catalog player outside", () => {
    expect(
      researchDraftableStateForPlayer(
        meta,
        { id: "99", valuation_eligible: true },
        false,
      ),
    ).toBe("outside");
  });

  it("does not tag custom players (unknown)", () => {
    expect(
      researchDraftableStateForPlayer(
        meta,
        { id: "10", valuation_eligible: true },
        true,
      ),
    ).toBe("unknown");
  });

  it("does not tag market_only / ineligible rows", () => {
    expect(
      researchDraftableStateForPlayer(
        meta,
        { id: "99", valuation_eligible: false },
        false,
      ),
    ).toBe("unknown");
  });

  it("unknown meta yields unknown for catalog player", () => {
    expect(
      researchDraftableStateForPlayer(
        { kind: "unknown" },
        { id: "10", valuation_eligible: true },
        false,
      ),
    ).toBe("unknown");
  });
});

describe("shouldShowOutsideDraftableMinBidTooltip", () => {
  it("true for outside pool and auction <= $1.05", () => {
    expect(
      shouldShowOutsideDraftableMinBidTooltip({
        draftable: "outside",
        auctionDollars: 1,
        valuationEligible: true,
      }),
    ).toBe(true);
    expect(
      shouldShowOutsideDraftableMinBidTooltip({
        draftable: "outside",
        auctionDollars: 1.05,
        valuationEligible: true,
      }),
    ).toBe(true);
  });

  it("false when valuation ineligible (market_only)", () => {
    expect(
      shouldShowOutsideDraftableMinBidTooltip({
        draftable: "outside",
        auctionDollars: 1,
        valuationEligible: false,
      }),
    ).toBe(false);
  });

  it("false when draftable or unknown", () => {
    expect(
      shouldShowOutsideDraftableMinBidTooltip({
        draftable: "draftable",
        auctionDollars: 1,
        valuationEligible: true,
      }),
    ).toBe(false);
    expect(
      shouldShowOutsideDraftableMinBidTooltip({
        draftable: "unknown",
        auctionDollars: 1,
        valuationEligible: true,
      }),
    ).toBe(false);
  });

  it("false when auction above min band", () => {
    expect(
      shouldShowOutsideDraftableMinBidTooltip({
        draftable: "outside",
        auctionDollars: 2,
        valuationEligible: true,
      }),
    ).toBe(false);
  });
});

describe("isNearMinimumAuctionBid", () => {
  it("treats 1.05 as near minimum", () => {
    expect(isNearMinimumAuctionBid(1.05)).toBe(true);
    expect(isNearMinimumAuctionBid(1.06)).toBe(false);
  });
});

describe("filterPlayersByResearchDraftablePool", () => {
  const rows = [
    { id: "1", research_draftable: "draftable" as const },
    { id: "2", research_draftable: "outside" as const },
    { id: "3", research_draftable: "unknown" as const },
  ];

  it("returns all when filter is all", () => {
    expect(filterPlayersByResearchDraftablePool(rows, "all")).toHaveLength(3);
  });

  it("draftable filter keeps only draftable", () => {
    expect(filterPlayersByResearchDraftablePool(rows, "draftable")).toEqual([
      rows[0],
    ]);
  });

  it("replacement filter keeps outside only", () => {
    expect(filterPlayersByResearchDraftablePool(rows, "replacement")).toEqual([
      rows[1],
    ]);
  });
});

describe("attachResearchDraftableFlags", () => {
  it("leaves market_only rows as unknown draftable state", () => {
    const meta = normalizeDraftablePoolMeta({
      draftable_player_ids: ["1"],
      draftable_pool_size: 1,
    });
    if (meta.kind !== "valid") throw new Error("fixture");
    const out = attachResearchDraftableFlags(
      [
        { id: "1", valuation_eligible: true },
        { id: "2", valuation_eligible: false },
      ],
      meta,
      () => false,
    );
    expect(out[0].research_draftable).toBe("draftable");
    expect(out[1].research_draftable).toBe("unknown");
  });
});

describe("TOOLTIP_OUTSIDE_DRAFTABLE_MIN_BID", () => {
  it("is non-empty copy", () => {
    expect(TOOLTIP_OUTSIDE_DRAFTABLE_MIN_BID.length).toBeGreaterThan(20);
  });
});
