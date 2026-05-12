import { describe, expect, it } from "vitest";
import { normalizeCatalogPlayer } from "./normalizeCatalogPlayer";

describe("normalizeCatalogPlayer", () => {
  it("defaults catalog_kind and valuation_eligible when omitted", () => {
    const p = normalizeCatalogPlayer({
      id: "1",
      mlbId: 1,
      name: "A",
      team: "NYY",
      position: "OF",
      age: 1,
      catalog_rank: 1,
      catalog_tier: 1,
      value: 1,
      headshot: "",
      stats: {},
      projection: {},
      outlook: "",
    } as unknown as Record<string, unknown>);
    expect(p.catalog_kind).toBe("valuation_eligible");
    expect(p.valuation_eligible).toBe(true);
  });

  it("honors market_only and explicit valuation_eligible false", () => {
    const p = normalizeCatalogPlayer({
      id: "669923",
      mlbId: 669923,
      catalog_kind: "market_only",
      valuation_eligible: false,
      market_adp: 14,
      name: "George Kirby",
      team: "SEA",
      position: "SP",
      age: 28,
      catalog_rank: 9998,
      catalog_tier: 5,
      value: 0,
      headshot: "",
      stats: {},
      projection: {},
      outlook: "",
    } as unknown as Record<string, unknown>);
    expect(p.catalog_kind).toBe("market_only");
    expect(p.valuation_eligible).toBe(false);
    expect(p.market_adp).toBe(14);
  });

  it("accepts camelCase catalogKind from API", () => {
    const p = normalizeCatalogPlayer({
      id: "2",
      mlbId: 2,
      catalogKind: "roster_context",
      valuationEligible: false,
      name: "B",
      team: "SEA",
      position: "RP",
      age: 22,
      catalog_rank: 2,
      catalog_tier: 5,
      value: 0,
      headshot: "",
      stats: {},
      projection: {},
      outlook: "",
    } as unknown as Record<string, unknown>);
    expect(p.catalog_kind).toBe("roster_context");
    expect(p.valuation_eligible).toBe(false);
  });
});
