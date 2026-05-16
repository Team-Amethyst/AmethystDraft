import { describe, it, expect } from "vitest";
import {
  shapeValuationResponseForDraft,
  parseDraftValuationDebugQuery,
} from "./draftValuationContract";

function sampleEngineResponse() {
  return {
    inflation_factor: 1.12,
    inflation_model: "replacement_slots_v2",
    inflation_index_vs_opening_auction: 1.07,
    inflation_percent_vs_auction_open: 5,
    inflation_raw: 0.2,
    inflation_bounded_by: "cap",
    total_budget_remaining: 200,
    pool_value_remaining: 999,
    players_remaining: 40,
    calculated_at: "2026-05-15T12:00:00.000Z",
    valuation_model_version: "v2-test",
    scoring_category_warnings: ["Hold is thin"],
    valuations: [
      {
        player_id: "1",
        name: "A",
        position: "SS",
        baseline_value: 30,
        adjusted_value: 28,
        auction_value: 28,
        team_adjusted_value: 32,
        recommended_bid: 25,
        max_bid: 30,
        edge: 999,
        indicator: "Fair Value",
        debug_v2: { lambda_used: 1 },
        tier: 2,
        valuation_explain: {
          scoring_category_warnings: ["Hold is thin"],
          surplus_basis: "ta_minus_rb",
        },
      },
    ],
    context_v2: {
      schema_version: "2",
      calculated_at: "2026-05-15T12:00:00.000Z",
      scope: { league_id: "lg" },
      assumptions: ["x"],
      confidence: { overall: 0.8 },
      market_summary: {
        headline: "Test",
        inflation_factor: 1.12,
        inflation_percent_vs_neutral: 3,
        inflation_percent_vs_auction_open: 4,
        inflation_index_vs_opening_auction: 1.07,
        budget_left: 200,
        players_left: 40,
        model_version: "v2-test",
      },
      position_alerts: [],
    },
  };
}

describe("shapeValuationResponseForDraft", () => {
  it("strips mechanical fields from default product response", () => {
    const raw = sampleEngineResponse();
    const before = JSON.stringify(raw).length;
    const shaped = shapeValuationResponseForDraft(raw, { debug: false });
    const after = JSON.stringify(shaped).length;
    const reductionPct = Math.round((1 - after / before) * 100);
    expect(reductionPct).toBeGreaterThanOrEqual(0);
    expect(after).toBeLessThan(before);
    expect(shaped).not.toHaveProperty("inflation_raw");
    expect(shaped).not.toHaveProperty("inflation_percent_vs_auction_open");
    expect(shaped).not.toHaveProperty("pool_value_remaining");
    expect(shaped.valuations[0]).not.toHaveProperty("debug_v2");
    expect(shaped.valuations[0]).not.toHaveProperty("adjusted_value");
    expect(shaped.valuations[0]).not.toHaveProperty("team_adjusted_value");
    const ms = (shaped.context_v2 as Record<string, unknown>)?.market_summary as
      | Record<string, unknown>
      | undefined;
    expect(ms).toBeDefined();
    expect(ms).not.toHaveProperty("budget_left");
  });

  it("echoes auction_curve_model for debug visibility", () => {
    const shaped = shapeValuationResponseForDraft(
      { ...sampleEngineResponse(), auction_curve_model: "tiered_surplus_v1" },
      { debug: false },
    ) as Record<string, unknown>;
    expect(shaped.auction_curve_model).toBe("tiered_surplus_v1");
  });

  it("exposes Draft contract field names and edge = team_value - recommended_bid", () => {
    const shaped = shapeValuationResponseForDraft(sampleEngineResponse(), {
      debug: false,
    }) as Record<string, unknown>;
    expect(shaped.model_version).toBe("v2-test");
    const row = shaped.valuations as unknown[];
    const r0 = row[0] as Record<string, unknown>;
    expect(r0.auction_value).toBe(28);
    expect(r0.team_value).toBe(32);
    expect(r0.recommended_bid).toBe(25);
    expect(r0.max_bid).toBe(30);
    expect(r0.edge).toBe(7);
    expect((r0.recommended_bid as number) <= (r0.max_bid as number)).toBe(true);
    expect(Array.isArray(shaped.scoring_category_warnings)).toBe(true);
    const ve = r0.valuation_explain as Record<string, unknown> | undefined;
    expect(ve?.surplus_basis).toBe("ta_minus_rb");
    expect(ve?.scoring_category_warnings).toBeUndefined();
  });

  it("includes full engine JSON under diagnostics when debug is true", () => {
    const raw = sampleEngineResponse();
    const shaped = shapeValuationResponseForDraft(raw, { debug: true }) as Record<
      string,
      unknown
    >;
    expect(shaped.diagnostics).toBeDefined();
    const eng = (shaped.diagnostics as { engine_response: unknown }).engine_response;
    expect(eng).toEqual(raw);
  });

  it("fills team_value from FMV when team_adjusted_value is omitted (matches Engine edge minuend)", () => {
    const raw = {
      calculated_at: "t",
      valuations: [
        {
          player_id: "p",
          name: "N",
          position: "OF",
          baseline_value: 20,
          adjusted_value: 18,
          recommended_bid: 12,
          max_bid: 16,
          edge: 6,
          indicator: "Fair Value",
        },
      ],
    };
    const shaped = shapeValuationResponseForDraft(raw, {
      debug: false,
    }) as Record<string, unknown>;
    const row = (shaped.valuations as Record<string, unknown>[])[0]!;
    expect(row.team_value).toBe(18);
    expect(row.auction_value).toBe(18);
    expect(row.recommended_bid).toBe(12);
    expect(row.edge).toBeCloseTo(6, 5);
    expect(row).not.toHaveProperty("adjusted_value");
  });

  it("clamps recommended_bid to max_bid on the shaped row when upstream ordering drifts", () => {
    const raw = {
      calculated_at: "t",
      valuations: [
        {
          player_id: "p",
          name: "N",
          position: "OF",
          baseline_value: 20,
          adjusted_value: 30,
          team_adjusted_value: 31,
          recommended_bid: 31,
          max_bid: 28,
          indicator: "Fair Value",
        },
      ],
    };
    const shaped = shapeValuationResponseForDraft(raw, {
      debug: false,
    }) as Record<string, unknown>;
    const row = (shaped.valuations as Record<string, unknown>[])[0]!;
    expect(row.recommended_bid).toBe(28);
    expect(row.max_bid).toBe(28);
    expect(row.edge).toBeCloseTo(3, 5);
    expect(row.recommended_bid).toBeLessThanOrEqual(row.max_bid as number);
  });

  it("parseDraftValuationDebugQuery reads debug/detail flags", () => {
    expect(parseDraftValuationDebugQuery({})).toBe(false);
    expect(parseDraftValuationDebugQuery({ debug: "1" })).toBe(true);
    expect(parseDraftValuationDebugQuery({ detail: "true" })).toBe(true);
  });
});
