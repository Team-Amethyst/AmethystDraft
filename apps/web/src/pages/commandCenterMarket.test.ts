import { describe, expect, it } from "vitest";
import type { ValuationResponse } from "../api/engine";
import type { MarketPressureSnapshot } from "../api/marketPressure";
import {
  buildInflationKpi,
  buildMarketPressureViewModel,
  VS_AUCTION_OPEN_HELP_TEXT,
} from "./commandCenterMarket";

function sampleMarketPressure(
  overrides: Partial<MarketPressureSnapshot> = {},
): MarketPressureSnapshot {
  return {
    market_inflation: {
      status: "not_started",
      ratio: null,
      percent: null,
      sample_size: 0,
      actual_spend: 0,
      expected_spend: 0,
      confidence: "none",
      label: "Not started",
      explanation: "No auction picks yet.",
      ...overrides.market_inflation,
    },
    budget_pressure: {
      status: "tight",
      total_budget_remaining: 1422,
      remaining_active_slots: 113,
      min_bid_reserve: 113,
      surplus_cash: 1309,
      total_surplus_mass: 6635,
      cash_to_surplus_mass_ratio: 0.2,
      dollars_per_open_slot: 12.58,
      label: "Tight",
      explanation: "Tight budget vs surplus mass.",
      ...overrides.budget_pressure,
    },
    keeper_compression: {
      status: "high",
      active_keeper_count: 76,
      active_capacity: 189,
      keeper_slot_fill_ratio: 0.4,
      keeper_salary_committed: 918,
      total_league_budget: 2340,
      keeper_budget_share: 0.39,
      label: "High",
      explanation: "76 keepers on 189 slots.",
      ...overrides.keeper_compression,
    },
    allocator_vs_open: {
      ratio: 1.02,
      percent: 2,
      label: "Allocator vs Open",
      explanation: VS_AUCTION_OPEN_HELP_TEXT,
      ...overrides.allocator_vs_open,
    },
  };
}

function baseMarket(
  overrides: Partial<ValuationResponse> = {},
): ValuationResponse {
  return {
    inflation_factor: 0.25,
    total_budget_remaining: 1422,
    players_remaining: 120,
    valuations: [],
    calculated_at: "2026-01-01T00:00:00Z",
    inflation_model: "replacement_slots_v2",
    inflation_index_vs_opening_auction: 1.02,
    context_v2: {
      market_summary: {
        headline: "test",
        inflation_factor: 0.25,
        inflation_percent_vs_neutral: -75,
        inflation_index_vs_opening_auction: 1.02,
      },
      position_alerts: [],
      market_pressure: sampleMarketPressure(),
    },
    ...overrides,
  };
}

describe("buildMarketPressureViewModel", () => {
  it("shows three primary engine concepts for pre-draft keeper", () => {
    const vm = buildMarketPressureViewModel(baseMarket(), false);
    expect(vm?.fromEngine).toBe(true);
    expect(vm?.primary.map((s) => s.label)).toEqual([
      "Market inflation",
      "Budget pressure",
      "Keeper compression",
    ]);
    expect(vm?.primary[0]?.value).toBe("Not started");
    expect(vm?.primary[1]?.value).toBe("Tight");
    expect(vm?.primary[2]?.value).toBe("High");
  });

  it("puts operational KPIs in secondary, allocator vs open last", () => {
    const vm = buildMarketPressureViewModel(baseMarket(), false);
    const secondaryLabels = vm?.secondary.map((s) => s.label) ?? [];
    expect(secondaryLabels).toContain("Budget left");
    expect(secondaryLabels).toContain("Open active slots");
    expect(secondaryLabels).toContain("Players remaining");
    expect(secondaryLabels).toContain("Surplus allocator");
    expect(vm?.allocatorVsOpen.label).toBe("Allocator vs Open");
    expect(vm?.allocatorVsOpen.helpText).toContain("not live auction inflation");
  });

  it("updates market inflation after first pick", () => {
    const vm = buildMarketPressureViewModel(
      baseMarket({
        context_v2: {
          market_summary: {
            headline: "test",
            inflation_factor: 0.25,
            inflation_percent_vs_neutral: -75,
          },
          position_alerts: [],
          market_pressure: sampleMarketPressure({
            market_inflation: {
              status: "low_sample",
              ratio: 1.05,
              percent: 5,
              sample_size: 1,
              actual_spend: 25,
              expected_spend: 24,
              confidence: "low",
              label: "Low sample",
              explanation: "One pick",
            },
          }),
        },
      }),
      false,
    );
    expect(vm?.primary[0]?.value).toContain("1.05×");
    expect(vm?.primary[0]?.detail).toContain("1 picks");
  });

  it("does not use legacy Inflation Index label", () => {
    const vm = buildMarketPressureViewModel(baseMarket(), false);
    const labels = [
      ...(vm?.primary.map((s) => s.label) ?? []),
      ...(vm?.secondary.map((s) => s.label) ?? []),
      vm?.allocatorVsOpen.label ?? "",
    ];
    expect(labels.some((l) => /inflation index/i.test(l))).toBe(false);
  });

  it("falls back when market_pressure missing", () => {
    const vm = buildMarketPressureViewModel(
      baseMarket({ context_v2: undefined }),
      false,
      { keeperCount: 76 },
    );
    expect(vm?.fromEngine).toBe(false);
    expect(vm?.primary.length).toBe(3);
  });
});

describe("buildInflationKpi", () => {
  it("remains compatible", () => {
    const model = buildInflationKpi(baseMarket(), false);
    expect(model.gaugeValue).toBe(1.02);
  });
});
