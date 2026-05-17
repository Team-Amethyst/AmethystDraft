import type { ValuationResponse } from "../api/engine";
import type { MarketPressureSnapshot } from "../api/marketPressure";

export type EnginePlayersKpi = {
  label: "Open Slots" | "Players Remaining";
  title: string;
};

export type MarketPressureSection = {
  id: string;
  label: string;
  value: string;
  detail?: string;
  title?: string;
};

export type MarketPressureViewModel = {
  fromEngine: boolean;
  /** Core product semantics from Engine (always three when `fromEngine`). */
  primary: MarketPressureSection[];
  /** Operational KPIs (budget, slots, allocator factor). */
  secondary: MarketPressureSection[];
  allocatorVsOpen: {
    label: string;
    displayValue: string;
    title?: string;
    helpText: string;
  };
};

export const VS_AUCTION_OPEN_HELP_TEXT =
  "Allocator vs Open compares the model's current surplus allocator to the auction-opening state. It is not live auction inflation and is not the same as Market Inflation below.";

export const MARKET_INFLATION_HELP_TEXT =
  "Market Inflation measures actual auction prices paid vs opening auction values for completed non-keeper picks only. Before the first auction pick, status is Not started.";

/** @deprecated Use {@link MarketPressureViewModel} */
export type InflationKpiViewModel = {
  isReplacementSlotsV2: boolean;
  gaugeValue: number | undefined;
  title: string | undefined;
  marketClass: "" | "hot" | "warm" | "cool" | "neutral";
};

export type BuildMarketPressureOptions = {
  leagueWideOpenSlots?: number | null;
  keeperCount?: number;
  leagueSlotCapacity?: number | null;
};

function formatRatio(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${ratio.toFixed(2)}×`;
}

function formatPercent(percent: number | null | undefined): string {
  if (percent == null || !Number.isFinite(percent)) return "";
  const sign = percent >= 0 ? "+" : "";
  return `${sign}${percent.toFixed(0)}%`;
}

function primarySectionsFromEngine(
  mp: MarketPressureSnapshot,
): MarketPressureSection[] {
  const inf = mp.market_inflation;
  const budget = mp.budget_pressure;
  const keeper = mp.keeper_compression;

  const inflationValue =
    inf.status === "not_started"
      ? inf.label
      : inf.ratio != null
        ? `${formatRatio(inf.ratio)} ${formatPercent(inf.percent)}`.trim()
        : inf.label;

  return [
    {
      id: "market_inflation",
      label: "Market inflation",
      value: inflationValue,
      detail:
        inf.status !== "not_started"
          ? `${inf.sample_size} picks · ${inf.confidence} confidence`
          : "No auction picks yet",
      title: [inf.explanation, MARKET_INFLATION_HELP_TEXT].join(" "),
    },
    {
      id: "budget_pressure",
      label: "Budget pressure",
      value: budget.label,
      detail: `$${Math.round(budget.total_budget_remaining)} left · ${budget.remaining_active_slots} slots`,
      title: budget.explanation,
    },
    {
      id: "keeper_compression",
      label: "Keeper compression",
      value: keeper.label,
      detail: `${keeper.active_keeper_count}/${keeper.active_capacity} slots · ${(keeper.keeper_slot_fill_ratio * 100).toFixed(0)}% fill`,
      title: keeper.explanation,
    },
  ];
}

function secondarySectionsFromEngine(
  mp: MarketPressureSnapshot,
  engineMarket: ValuationResponse,
  options: BuildMarketPressureOptions,
): MarketPressureSection[] {
  const budget = mp.budget_pressure;
  const allocatorFactor =
    engineMarket.context_v2?.market_summary.inflation_factor ??
    engineMarket.inflation_factor;

  const openSlots =
    options.leagueWideOpenSlots ?? budget.remaining_active_slots;

  return [
    {
      id: "budget_left",
      label: "Budget left",
      value: `$${Math.round(budget.total_budget_remaining)}`,
      title: "League-wide auction budget still unspent.",
    },
    {
      id: "open_slots",
      label: "Open active slots",
      value: openSlots != null ? String(openSlots) : "—",
      title: "Empty auction roster spots across all teams (excludes minors/taxi).",
    },
    {
      id: "players_remaining",
      label: "Players remaining",
      value: String(engineMarket.players_remaining),
      title: "Undrafted players in the engine valuation pool for this request.",
    },
    {
      id: "surplus_allocator",
      label: "Surplus allocator",
      value: formatRatio(allocatorFactor),
      title:
        "Surplus allocation factor (replacement_slots_v2 inflation_factor). Not market inflation or allocator vs open.",
    },
    ...(budget.cash_to_surplus_mass_ratio != null
      ? [
          {
            id: "cash_pressure",
            label: "Cash / surplus mass",
            value: `${budget.cash_to_surplus_mass_ratio.toFixed(2)}×`,
            title: `Surplus cash $${Math.round(budget.surplus_cash)} vs total surplus mass $${Math.round(budget.total_surplus_mass ?? 0)}.`,
          } satisfies MarketPressureSection,
        ]
      : []),
  ];
}

function buildFallbackPrimary(
  engineMarket: ValuationResponse,
  options: BuildMarketPressureOptions,
): MarketPressureSection[] {
  return [
    {
      id: "market_inflation",
      label: "Market inflation",
      value: "—",
      detail: "Engine market_pressure unavailable",
      title: "Legacy snapshot — inflation from picks cannot be shown.",
    },
    {
      id: "budget_pressure",
      label: "Budget pressure",
      value: "—",
      detail: `$${Math.round(engineMarket.total_budget_remaining)} left`,
      title: "Limited fallback metrics only.",
    },
    {
      id: "keeper_compression",
      label: "Keeper compression",
      value: options.keeperCount != null ? String(options.keeperCount) : "—",
      title: "Keeper count from draft board when engine snapshot is missing.",
    },
  ];
}

function buildFallbackSecondary(
  engineMarket: ValuationResponse,
  options: BuildMarketPressureOptions,
): MarketPressureSection[] {
  const slots =
    options.leagueWideOpenSlots ??
    engineMarket.curve_inputs?.remaining_slots ??
    null;
  return [
    {
      id: "budget_left",
      label: "Budget left",
      value: `$${Math.round(engineMarket.total_budget_remaining)}`,
    },
    {
      id: "open_slots",
      label: "Open active slots",
      value: slots != null ? String(slots) : "—",
    },
    {
      id: "players_remaining",
      label: "Players remaining",
      value: String(engineMarket.players_remaining),
    },
    {
      id: "surplus_allocator",
      label: "Surplus allocator",
      value: formatRatio(engineMarket.inflation_factor),
    },
  ];
}

export function buildMarketPressureViewModel(
  engineMarket: ValuationResponse | null,
  _isDev: boolean,
  options: BuildMarketPressureOptions = {},
): MarketPressureViewModel | null {
  if (!engineMarket) return null;

  const mp = engineMarket.context_v2?.market_pressure;
  const allocatorVsOpen = mp?.allocator_vs_open;
  const idx =
    allocatorVsOpen?.ratio ??
    engineMarket.inflation_index_vs_opening_auction ??
    engineMarket.context_v2?.market_summary.inflation_index_vs_opening_auction;

  const allocatorSection: MarketPressureViewModel["allocatorVsOpen"] = {
    label: allocatorVsOpen?.label ?? "Allocator vs Open",
    displayValue: formatRatio(idx ?? null),
    title: allocatorVsOpen?.explanation ?? VS_AUCTION_OPEN_HELP_TEXT,
    helpText: VS_AUCTION_OPEN_HELP_TEXT,
  };

  if (mp) {
    return {
      fromEngine: true,
      primary: primarySectionsFromEngine(mp),
      secondary: secondarySectionsFromEngine(mp, engineMarket, options),
      allocatorVsOpen: allocatorSection,
    };
  }

  return {
    fromEngine: false,
    primary: buildFallbackPrimary(engineMarket, options),
    secondary: buildFallbackSecondary(engineMarket, options),
    allocatorVsOpen: allocatorSection,
  };
}

/** @deprecated Prefer {@link buildMarketPressureViewModel} */
export function buildInflationKpi(
  engineMarket: ValuationResponse | null,
  isDev: boolean,
): InflationKpiViewModel {
  const vm = buildMarketPressureViewModel(engineMarket, isDev);
  const idx = engineMarket?.inflation_index_vs_opening_auction;
  return {
    isReplacementSlotsV2:
      engineMarket?.inflation_model === "replacement_slots_v2" ||
      Boolean(engineMarket?.context_v2),
    gaugeValue: idx,
    title: vm?.allocatorVsOpen.title,
    marketClass: "",
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
