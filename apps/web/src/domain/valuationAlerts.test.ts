import { describe, expect, it } from "vitest";
import type { ValuationResponse } from "../api/engine";
import {
  dedupeValuationAlerts,
  filterValuationAlertsForSurface,
  normalizeValuationAlerts,
  type ValuationUiAlert,
} from "./valuationAlerts";

function baseResponse(
  overrides: Partial<ValuationResponse> = {},
): ValuationResponse {
  return {
    inflation_factor: 1,
    total_budget_remaining: 100,
    pool_value_remaining: 100,
    players_remaining: 10,
    valuations: [],
    calculated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("normalizeValuationAlerts", () => {
  it("returns no alerts when response is null", () => {
    expect(normalizeValuationAlerts(null)).toEqual([]);
    expect(normalizeValuationAlerts(undefined)).toEqual([]);
  });

  it("returns no alerts when response is clean", () => {
    expect(normalizeValuationAlerts(baseResponse())).toEqual([]);
  });

  it("maps thin pool style valuation_context_warnings", () => {
    const alerts = normalizeValuationAlerts(
      baseResponse({
        valuation_context_warnings: ["Thin pool in remaining hitters."],
      }),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.kind).toBe("thin_pool");
    expect(alerts[0]!.title).toBe("Thin pool");
    expect(alerts[0]!.message).toContain("Thin pool");
  });

  it("maps unsupported scoring category warning strings", () => {
    const alerts = normalizeValuationAlerts(
      baseResponse({
        valuation_context_warnings: ["Unsupported category SV for this league."],
      }),
    );
    expect(alerts[0]!.kind).toBe("unsupported_category");
  });

  it("maps scoring_category_warnings from board rows (deduped)", () => {
    const alerts = normalizeValuationAlerts(
      baseResponse({
        valuations: [
          {
            player_id: "a",
            name: "A",
            position: "SP",
            tier: 1,
            baseline_value: 1,
            auction_value: 1,
            valuation_explain: {
              scoring_category_warnings: ["SV is thin", "SV is thin"],
            },
          } as never,
          {
            player_id: "b",
            name: "B",
            position: "RP",
            tier: 1,
            baseline_value: 1,
            auction_value: 1,
            valuation_explain: {
              scoring_category_warnings: ["SV is thin"],
            },
          } as never,
        ],
      }),
    );
    const sv = alerts.filter((x) => x.message === "SV is thin");
    expect(sv).toHaveLength(1);
    expect(sv[0]!.kind).toBe("unsupported_category");
  });

  it("maps context_v2.position_alerts to position_scarcity", () => {
    const alerts = normalizeValuationAlerts(
      baseResponse({
        context_v2: {
          schema_version: "2",
          calculated_at: "t",
          scope: { league_id: "x" },
          market_summary: {
            headline: "h",
            inflation_factor: 1,
            inflation_percent_vs_neutral: 0,
            budget_left: 1,
            players_left: 1,
            model_version: "m",
          },
          position_alerts: [
            {
              position: "SS",
              severity: "high",
              urgency_score: 1,
              message: "Elite shortstops nearly gone.",
              evidence: {
                elite_remaining: 0,
                mid_tier_remaining: 1,
                total_remaining: 2,
              },
              recommended_action: "bid",
            },
          ],
          assumptions: [],
          confidence: { overall: 0.5 },
        },
      }),
    );
    expect(alerts.some((a) => a.kind === "position_scarcity")).toBe(true);
    const pa = alerts.find((a) => a.kind === "position_scarcity")!;
    expect(pa.title).toContain("SS");
    expect(pa.severity).toBe("warning");
  });

  it("maps monopoly strings from valuation_context_warnings", () => {
    const alerts = normalizeValuationAlerts(
      baseResponse({
        valuation_context_warnings: ["Monopoly risk on top-tier closers."],
      }),
    );
    expect(alerts[0]!.kind).toBe("monopoly");
  });

  it("maps monopoly_warnings array on valuation_context without crashing", () => {
    const alerts = normalizeValuationAlerts(
      baseResponse({
        valuation_context: {
          monopoly_warnings: ["One team rostered four aces."],
        } as Record<string, unknown>,
      }),
    );
    expect(alerts.some((a) => a.kind === "monopoly")).toBe(true);
  });

  it("does not crash on unknown valuation_context shapes", () => {
    expect(() =>
      normalizeValuationAlerts(
        baseResponse({
          valuation_context: {
            weird: { nested: [1, 2, 3] },
            ok: "x",
          } as Record<string, unknown>,
        }),
      ),
    ).not.toThrow();
  });

  it("dedupes duplicate alerts by id / kind+title+message", () => {
    const duped: ValuationUiAlert[] = [
      {
        id: "a",
        kind: "thin_pool",
        severity: "warning",
        title: "Thin pool",
        message: "Same",
      },
      {
        id: "b",
        kind: "thin_pool",
        severity: "warning",
        title: "Thin pool",
        message: "Same",
      },
    ];
    expect(dedupeValuationAlerts(duped)).toHaveLength(1);
  });

  it("focusPlayerId limits scoring warnings to that row", () => {
    const res = baseResponse({
      valuations: [
        {
          player_id: "p1",
          name: "A",
          position: "C",
          tier: 1,
          baseline_value: 1,
          auction_value: 1,
          valuation_explain: {
            scoring_category_warnings: ["Only for P1"],
          },
        } as never,
        {
          player_id: "p2",
          name: "B",
          position: "1B",
          tier: 1,
          baseline_value: 1,
          auction_value: 1,
          valuation_explain: {
            scoring_category_warnings: ["Only for P2"],
          },
        } as never,
      ],
    });
    const a = normalizeValuationAlerts(res, { focusPlayerId: "p1" });
    expect(a.some((x) => x.message === "Only for P1")).toBe(true);
    expect(a.some((x) => x.message === "Only for P2")).toBe(false);
  });
});

describe("filterValuationAlertsForSurface", () => {
  const sample: ValuationUiAlert[] = [
    {
      id: "1",
      kind: "thin_pool",
      severity: "warning",
      title: "Thin pool",
      message: "x",
    },
    {
      id: "2",
      kind: "position_scarcity",
      severity: "warning",
      title: "SS scarcity",
      message: "y",
    },
    {
      id: "3",
      kind: "unsupported_category",
      severity: "warning",
      title: "Scoring",
      message: "z",
    },
  ];

  it("research omits position scarcity", () => {
    const f = filterValuationAlertsForSurface(sample, "research");
    expect(f.find((x) => x.kind === "position_scarcity")).toBeUndefined();
    expect(f.length).toBe(2);
  });

  it("auction-center keeps SS scarcity when SS selected", () => {
    const f = filterValuationAlertsForSurface(sample, "auction-center", {
      selectedPlayerPositions: ["SS"],
    });
    expect(f.some((x) => x.kind === "position_scarcity")).toBe(true);
  });

  it("auction-center drops SS scarcity when OF selected", () => {
    const f = filterValuationAlertsForSurface(sample, "auction-center", {
      selectedPlayerPositions: ["OF"],
    });
    expect(f.some((x) => x.kind === "position_scarcity")).toBe(false);
  });
});
