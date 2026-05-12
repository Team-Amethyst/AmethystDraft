import type { ValuationResponse } from "../api/engine";

export type EnginePlayersKpi = {
  label: "Open Slots" | "Players Remaining";
  title: string;
};

export type InflationKpiViewModel = {
  isReplacementSlotsV2: boolean;
  gaugeValue: number | undefined;
  title: string | undefined;
  marketClass: "" | "hot" | "warm" | "cool" | "neutral";
};

function finiteMetric(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function marketClassForInflation(
  inflationGaugeValue: number | undefined,
): "" | "hot" | "warm" | "cool" | "neutral" {
  if (inflationGaugeValue == null) return "";
  if (inflationGaugeValue >= 1.35) return "hot";
  if (inflationGaugeValue >= 1.15) return "warm";
  if (inflationGaugeValue <= 0.9) return "cool";
  return "neutral";
}

export function buildInflationKpi(
  engineMarket: ValuationResponse | null,
  isDev: boolean,
): InflationKpiViewModel {
  const firstRowInflationModel = engineMarket?.valuations?.[0]?.inflation_model;
  const inflationModel = engineMarket?.inflation_model ?? firstRowInflationModel;

  // Engine may omit envelope `inflation_model` while still sending v2 `context_v2`.
  const isReplacementSlotsV2 =
    inflationModel === "replacement_slots_v2" || Boolean(engineMarket?.context_v2);

  const allocatorFactor =
    engineMarket?.context_v2?.market_summary.inflation_factor ??
    engineMarket?.inflation_factor;
  const allocatorFinite = finiteMetric(allocatorFactor);

  const indexVsOpen =
    finiteMetric(engineMarket?.inflation_index_vs_opening_auction) ??
    finiteMetric(
      engineMarket?.context_v2?.market_summary.inflation_index_vs_opening_auction,
    );

  const useAuctionOpenIndex = isReplacementSlotsV2 && indexVsOpen != null;
  const gaugeValue = useAuctionOpenIndex
    ? indexVsOpen
    : !isReplacementSlotsV2
      ? allocatorFinite
      : undefined;

  const pctVsAuctionOpen = finiteMetric(
    engineMarket?.context_v2?.market_summary.inflation_percent_vs_auction_open,
  );
  const pctVsNeutralFromSummary = finiteMetric(
    engineMarket?.context_v2?.market_summary.inflation_percent_vs_neutral,
  );
  const inflationPctNeutral =
    pctVsNeutralFromSummary ??
    (allocatorFinite != null ? Math.round((allocatorFinite - 1) * 100) : null);

  const inflationTooltipPct =
    useAuctionOpenIndex && pctVsAuctionOpen != null
      ? Math.round(pctVsAuctionOpen)
      : useAuctionOpenIndex && indexVsOpen != null
        ? Math.round((indexVsOpen - 1) * 100)
        : inflationPctNeutral;

  const auctionOpenTitleBody =
    inflationTooltipPct != null
      ? `Vs auction open: ${inflationTooltipPct >= 0 ? "+" : ""}${inflationTooltipPct}%`
      : "Vs auction open";
  const devAllocatorHint =
    isDev && allocatorFinite != null
      ? ` · Model factor (debug): ${allocatorFinite.toFixed(2)}×`
      : "";

  const title =
    gaugeValue == null
      ? isReplacementSlotsV2
        ? "Auction-open index unavailable for this payload. Raw model factor is hidden here (not comparable to 1.0× at open)."
        : undefined
      : useAuctionOpenIndex
        ? `${auctionOpenTitleBody}${devAllocatorHint}`
        : inflationTooltipPct != null
          ? `Vs neutral: ${inflationTooltipPct >= 0 ? "+" : ""}${inflationTooltipPct}%`
          : undefined;

  return {
    isReplacementSlotsV2,
    gaugeValue,
    title,
    marketClass: marketClassForInflation(gaugeValue),
  };
}

export function enginePlayersKpiCopy(
  playersRemaining: number,
  valuationsLen: number,
  leagueWideSlots: number | null,
): EnginePlayersKpi {
  if (
    leagueWideSlots != null &&
    valuationsLen > 0 &&
    playersRemaining === valuationsLen
  ) {
    return {
      label: "Players Remaining",
      title:
        "Count matches the valuation rows returned for this request (engine player subset), not full league roster slots.",
    };
  }
  if (
    leagueWideSlots != null &&
    Math.abs(playersRemaining - leagueWideSlots) <= 2
  ) {
    return {
      label: "Open Slots",
      title:
        "Auction roster spots still empty across all teams (from your league template and draft board).",
    };
  }
  return {
    label: "Players Remaining",
    title:
      "From the valuation engine; may differ from roster template when the engine uses a player subset or another market-depth definition.",
  };
}
