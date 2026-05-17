import { describe, expect, it } from "vitest";
import type { ValuationResponse } from "../api/engine";
import type { MarketPressureSnapshot } from "../api/marketPressure";
import {
  buildHumanSummary,
  buildInflationKpi,
  buildMarketPressureViewModel,
  buildPhaseTag,
  formatBudgetChipText,
  formatInflationChipText,
  formatInflationRowLabel,
  formatInflationRowValue,
  formatModelDetailsContextLine,
  formatBudgetRowLabel,
  formatBudgetRowValue,
  formatKeeperRowLabel,
  formatKeeperRowValue,
  formatKeeperChipText,
  MODEL_DETAILS_GUIDANCE,
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

describe("market pressure copy helpers", () => {
  it("maps inflation status to phase tag and row copy", () => {
    expect(buildPhaseTag({
      status: "not_started",
      percent: null,
      ratio: null,
      sample_size: 0,
      actual_spend: 0,
      expected_spend: 0,
      confidence: "none",
      label: "Not started",
      explanation: "",
    })).toBe("PRE-DRAFT");
    expect(buildPhaseTag({
      status: "low_sample",
      percent: 350,
      ratio: 4.5,
      sample_size: 10,
      actual_spend: 0,
      expected_spend: 0,
      confidence: "medium",
      label: "Low sample",
      explanation: "",
    })).toBe("EARLY");
    expect(buildHumanSummary("not_started")).toBe("PRE-DRAFT");
    expect(buildHumanSummary("low_sample")).toBe("EARLY");
    expect(buildHumanSummary("inflated")).toBe("LIVE");
    expect(
      formatInflationChipText({
        status: "low_sample",
        percent: 350,
        ratio: 4.5,
        sample_size: 10,
        actual_spend: 0,
        expected_spend: 0,
        confidence: "medium",
        label: "Low sample",
        explanation: "",
      }),
    ).toBe("Market inflation · +350%");
    expect(formatBudgetRowLabel()).toBe("Budget pressure");
    expect(formatBudgetRowValue("tight")).toBe("Tight");
    expect(formatKeeperRowLabel()).toBe("Keeper compression");
    expect(formatKeeperRowValue("high")).toBe("High");
    expect(
      formatInflationRowLabel({
        status: "low_sample",
        percent: 350,
        ratio: 4.5,
        sample_size: 10,
        actual_spend: 0,
        expected_spend: 0,
        confidence: "medium",
        label: "Low sample",
        explanation: "",
      }),
    ).toBe("Market inflation");
    expect(
      formatInflationRowValue({
        status: "low_sample",
        percent: 350,
        ratio: 4.5,
        sample_size: 10,
        actual_spend: 0,
        expected_spend: 0,
        confidence: "medium",
        label: "Low sample",
        explanation: "",
      }),
    ).toBe("+350%");
    expect(
      formatModelDetailsContextLine(2872, 243, 894, {
        status: "low_sample",
        percent: 350,
        ratio: 4.5,
        sample_size: 10,
        actual_spend: 0,
        expected_spend: 0,
        confidence: "medium",
        label: "Low sample",
        explanation: "",
      }),
    ).toBe("$2872 left · 243 slots · 894 players · low sample");
    expect(formatModelDetailsContextLine(1422, 113, 786)).toBe(
      "$1422 left · 113 slots · 786 players",
    );
    expect(
      formatInflationRowLabel({
        status: "not_started",
        percent: null,
        ratio: null,
        sample_size: 0,
        actual_spend: 0,
        expected_spend: 0,
        confidence: "none",
        label: "Not started",
        explanation: "",
      }),
    ).toBe("Market inflation");
    expect(
      formatInflationRowValue({
        status: "not_started",
        percent: null,
        ratio: null,
        sample_size: 0,
        actual_spend: 0,
        expected_spend: 0,
        confidence: "none",
        label: "Not started",
        explanation: "",
      }),
    ).toBe("Not started");
  });

  it("maps budget and keeper chip labels", () => {
    expect(formatBudgetChipText("tight")).toBe("Budget tight");
    expect(formatKeeperChipText("high")).toBe("Keepers high");
  });
});

describe("buildMarketPressureViewModel", () => {
  it("builds compact pre_draft dashboard copy", () => {
    const vm = buildMarketPressureViewModel(baseMarket(), false, {
      leagueWideOpenSlots: 113,
    });
    expect(vm?.compact.phaseTag).toBe("PRE-DRAFT");
    expect(vm?.compact.humanSummary).toBe("PRE-DRAFT");
    expect(vm?.compact.statusRows).toHaveLength(3);
    expect(vm?.compact.statusRows[0].label).toBe("Market inflation");
    expect(vm?.compact.statusRows[0].value).toBe("Not started");
    expect(vm?.compact.statusRows[1].label).toBe("Budget pressure");
    expect(vm?.compact.statusRows[1].value).toBe("Tight");
    expect(vm?.compact.statusRows[2].label).toBe("Keeper compression");
    expect(vm?.compact.statusRows[2].value).toBe("High");
    expect(vm?.compact.inflationChip.text).toBe("Not started");
    expect(vm?.compact.budgetChip.text).toBe("Budget tight");
    expect(vm?.compact.keeperChip.text).toBe("Keepers high");
    expect(vm?.compact.summaryLine).toContain("$1422 left");
    expect(vm?.compact.summaryLine).toContain("113 slots");
    expect(vm?.detailGuidance).toBe(MODEL_DETAILS_GUIDANCE);
  });

  it("builds compact after_pick_10 dashboard copy", () => {
    const vm = buildMarketPressureViewModel(
      baseMarket({
        players_remaining: 778,
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
              ratio: 4.5,
              percent: 350,
              sample_size: 10,
              actual_spend: 450,
              expected_spend: 100,
              confidence: "medium",
              label: "Low sample",
              explanation: "10 picks",
            },
            budget_pressure: {
              status: "tight",
              total_budget_remaining: 1139,
              remaining_active_slots: 103,
              min_bid_reserve: 103,
              surplus_cash: 1000,
              total_surplus_mass: 5000,
              cash_to_surplus_mass_ratio: 0.18,
              dollars_per_open_slot: 11,
              label: "Tight",
              explanation: "Tight",
            },
          }),
        },
      }),
      false,
      { leagueWideOpenSlots: 103 },
    );
    expect(vm?.compact.phaseTag).toBe("EARLY");
    expect(vm?.compact.statusRows).toHaveLength(3);
    expect(vm?.compact.statusRows[0].label).toBe("Market inflation");
    expect(vm?.compact.statusRows[0].value).toBe("+350%");
    expect(vm?.compact.statusRows[0].valueContext).toBeUndefined();
    expect(vm?.modelDetailsContextLine).toBe(
      "$1139 left · 103 slots · 778 players · low sample",
    );
    expect(vm?.compact.statusRows[1].label).toBe("Budget pressure");
    expect(vm?.compact.statusRows[1].value).toBe("Tight");
    expect(vm?.compact.statusRows[2].label).toBe("Keeper compression");
    expect(vm?.compact.statusRows[2].value).toBe("High");
    expect(vm?.compact.inflationChip.text).toBe("Market inflation · +350%");
    expect(vm?.compact.summaryLine).toBe(
      "$1139 left · 103 slots · 778 players · low sample",
    );
    expect(vm?.detailGroups).toHaveLength(4);
    expect(vm?.detailGroups.map((g) => g.heading)).toEqual([
      "Market inflation",
      "Budget pressure",
      "Keeper compression",
      "Model comparator",
    ]);
    expect(vm?.detailGroups[0].metricLine).toBe("4.50× · +350% · medium confidence");
    expect(vm?.detailGroups[0].explanation).toContain("10 auction picks");
    expect(vm?.detailGroups[3].metricLine).toContain("Allocator vs Open");
    expect(vm?.details.some((d) => d.label === "Cash / surplus mass")).toBe(true);
  });

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
