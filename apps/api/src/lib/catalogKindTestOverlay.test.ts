import { describe, expect, it, afterEach, vi } from "vitest";
import { appendCatalogKindTestOverlay, catalogKindTestOverlayMarketOnlyKirby } from "./catalogKindTestOverlay";
import type { PlayerData } from "./playerCatalog";

describe("appendCatalogKindTestOverlay", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is a no-op when env is unset", () => {
    const base: PlayerData[] = [
      {
        id: "1",
        mlbId: 1,
        catalog_kind: "valuation_eligible",
        valuation_eligible: true,
        name: "A",
        team: "NYY",
        position: "OF",
        positions: ["OF"],
        age: 1,
        catalog_rank: 1,
        value: 5,
        catalog_tier: 2,
        headshot: "",
        stats: {},
        projection: {},
        outlook: "",
      },
    ];
    expect(appendCatalogKindTestOverlay(base)).toEqual(base);
  });

  it("appends Kirby and roster_context fixtures when AMETHYST_CATALOG_KIND_TEST_OVERLAY=1", () => {
    vi.stubEnv("AMETHYST_CATALOG_KIND_TEST_OVERLAY", "1");
    const out = appendCatalogKindTestOverlay([]);
    const kirby = out.find((p) => p.id === String(catalogKindTestOverlayMarketOnlyKirby.mlbId));
    expect(kirby?.name).toBe("George Kirby");
    expect(kirby?.catalog_kind).toBe("market_only");
    expect(kirby?.valuation_eligible).toBe(false);
    expect(kirby?.market_adp).toBe(14);
    expect(out.some((p) => p.catalog_kind === "roster_context")).toBe(true);
  });

  it("does not duplicate Kirby if already in list", () => {
    vi.stubEnv("AMETHYST_CATALOG_KIND_TEST_OVERLAY", "1");
    const kirby = { ...catalogKindTestOverlayMarketOnlyKirby };
    const out = appendCatalogKindTestOverlay([kirby]);
    expect(out.filter((p) => p.id === kirby.id)).toHaveLength(1);
  });
});
