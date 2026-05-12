import { describe, expect, it } from "vitest";
import type { ValuationResponse } from "../api/engine";
import { buildInflationKpi, enginePlayersKpiCopy } from "./commandCenterMarket";

function baseMarket(
  overrides: Partial<ValuationResponse> = {},
): ValuationResponse {
  return {
    inflation_factor: 1,
    total_budget_remaining: 1000,
    pool_value_remaining: 1000,
    players_remaining: 120,
    valuations: [],
    calculated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildInflationKpi", () => {
  it("uses auction-open index for v2 when available", () => {
    const model = buildInflationKpi(
      baseMarket({
        inflation_model: "replacement_slots_v2",
        inflation_factor: 0.66,
        inflation_index_vs_opening_auction: 1.02,
      }),
      false,
    );
    expect(model.gaugeValue).toBe(1.02);
    expect(model.isReplacementSlotsV2).toBe(true);
    expect(model.title).toContain("Vs auction open");
  });

  it("hides gauge for v2 payload without auction-open index", () => {
    const model = buildInflationKpi(
      baseMarket({
        inflation_model: "replacement_slots_v2",
        inflation_factor: 0.66,
      }),
      false,
    );
    expect(model.gaugeValue).toBeUndefined();
    expect(model.title).toContain("unavailable");
  });

  it("uses allocator factor for non-v2 payloads", () => {
    const model = buildInflationKpi(
      baseMarket({
        inflation_factor: 1.17,
      }),
      false,
    );
    expect(model.gaugeValue).toBe(1.17);
    expect(model.marketClass).toBe("warm");
    expect(model.title).toContain("Vs neutral");
  });
});

describe("enginePlayersKpiCopy", () => {
  it("shows open slots label when close to league slot count", () => {
    const result = enginePlayersKpiCopy(210, 300, 209);
    expect(result.label).toBe("Open Slots");
  });

  it("shows players remaining label for engine subset counts", () => {
    const result = enginePlayersKpiCopy(180, 180, 260);
    expect(result.label).toBe("Players Remaining");
  });
});
