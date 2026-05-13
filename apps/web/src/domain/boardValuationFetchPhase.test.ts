import { describe, expect, it } from "vitest";
import {
  classifyBoardValuationFetchPhase,
  shouldMaskResearchEngineColumns,
} from "./boardValuationFetchPhase";

describe("classifyBoardValuationFetchPhase", () => {
  it("returns idle when fetch cannot start", () => {
    expect(
      classifyBoardValuationFetchPhase({
        canStartFetch: false,
        peekHit: false,
        activeCacheKey: "k2",
        lastSuccessCacheKey: "k1",
        displayedBoardPresent: true,
      }),
    ).toBe("idle");
  });

  it("returns ready_sync on cache peek hit", () => {
    expect(
      classifyBoardValuationFetchPhase({
        canStartFetch: true,
        peekHit: true,
        activeCacheKey: "k",
        lastSuccessCacheKey: null,
        displayedBoardPresent: false,
      }),
    ).toBe("ready_sync");
  });

  it("returns loading when no prior board", () => {
    expect(
      classifyBoardValuationFetchPhase({
        canStartFetch: true,
        peekHit: false,
        activeCacheKey: "k1",
        lastSuccessCacheKey: null,
        displayedBoardPresent: false,
      }),
    ).toBe("loading");
  });

  it("returns refreshing when board shown and cache key changed", () => {
    expect(
      classifyBoardValuationFetchPhase({
        canStartFetch: true,
        peekHit: false,
        activeCacheKey: "k2",
        lastSuccessCacheKey: "k1",
        displayedBoardPresent: true,
      }),
    ).toBe("refreshing");
  });

  it("returns loading when same key refetch (no stale board from different key)", () => {
    expect(
      classifyBoardValuationFetchPhase({
        canStartFetch: true,
        peekHit: false,
        activeCacheKey: "k1",
        lastSuccessCacheKey: "k1",
        displayedBoardPresent: true,
      }),
    ).toBe("loading");
  });
});

describe("shouldMaskResearchEngineColumns", () => {
  it("masks only valuation rows while board is loading", () => {
    expect(
      shouldMaskResearchEngineColumns("loading", {
        valuation_eligible: true,
        catalog_kind: "valuation_eligible",
      }),
    ).toBe(true);
    expect(
      shouldMaskResearchEngineColumns("loading", {
        valuation_eligible: false,
        catalog_kind: "market_only",
      }),
    ).toBe(false);
    expect(
      shouldMaskResearchEngineColumns("ready", {
        valuation_eligible: true,
        catalog_kind: "valuation_eligible",
      }),
    ).toBe(false);
  });
});
