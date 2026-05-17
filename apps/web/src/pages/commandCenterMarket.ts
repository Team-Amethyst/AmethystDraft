import type { ValuationResponse } from "../api/engine";
import type {
  BudgetPressureStatus,
  KeeperCompressionStatus,
  MarketInflationPressure,
  MarketInflationStatus,
  MarketPressureSnapshot,
} from "../api/marketPressure";

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

export type MarketPressureStatusChip = {
  id: string;
  text: string;
  variant: "inflation" | "budget" | "keeper" | "neutral";
  title?: string;
};

export type MarketPressurePhaseTag = "PRE-DRAFT" | "EARLY" | "LIVE";

/** One label/value row in the collapsed Market Pressure summary. */
export type MarketPressureStatusRow = {
  id: string;
  label: string;
  value: string;
  /** Muted subtext under the value (e.g. low-sample pick count). */
  valueContext?: string;
  labelTone: "inflation" | "budget" | "keeper" | "neutral";
  valueTone: "inflation" | "budget" | "keeper" | "muted";
  title?: string;
};

/** Popover explanation group — not a duplicate of collapsed rows. */
export type MarketPressureDetailGroup = {
  id: string;
  heading: string;
  explanation: string;
  metricLine: string;
  title?: string;
};

export type MarketPressureStatusRows = [
  MarketPressureStatusRow,
  MarketPressureStatusRow,
  MarketPressureStatusRow,
];

export type MarketPressureViewModel = {
  fromEngine: boolean;
  /** Collapsed summary: phase tag, three status rows, metric line. */
  compact: {
    phaseTag: MarketPressurePhaseTag;
    /** @deprecated Use {@link MarketPressureViewModel.compact.phaseTag}. */
    humanSummary: string;
    statusRows: MarketPressureStatusRows;
    /** @deprecated Shown in {@link MarketPressureViewModel.modelDetailsContextLine} only. */
    summaryLine: string;
    fallbackNote?: string;
    /** @deprecated Use {@link MarketPressureViewModel.compact.statusRows}. */
    inflationChip: MarketPressureStatusChip;
    /** @deprecated Use {@link MarketPressureViewModel.compact.statusRows}. */
    budgetChip: MarketPressureStatusChip;
    /** @deprecated Use {@link MarketPressureViewModel.compact.statusRows}. */
    keeperChip: MarketPressureStatusChip;
  };
  /** Lead line in Model details (budget · slots · players · low sample when relevant). */
  modelDetailsContextLine: string;
  /** Model details popover — explanatory groups, not collapsed duplicates. */
  detailGroups: MarketPressureDetailGroup[];
  /** @deprecated Use {@link MarketPressureViewModel.detailGroups}. */
  details: MarketPressureSection[];
  /** @deprecated Shown inside model comparator group. */
  detailGuidance: string;
  /** @deprecated Legacy tile rows; kept for compatibility. */
  primary: MarketPressureSection[];
  /** @deprecated Legacy KPI rows; kept for compatibility. */
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

/** Short footnote under expanded Model details in the right rail. */
export const MODEL_DETAILS_GUIDANCE =
  "Allocator vs Open compares model pressure to auction open. It is not live market inflation.";

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

/** Small phase tag for the collapsed card header. */
export function buildPhaseTag(inf: MarketInflationPressure): MarketPressurePhaseTag {
  if (inf.status === "not_started") return "PRE-DRAFT";
  if (inf.status === "low_sample") return "EARLY";
  if (
    inf.status === "inflated" ||
    inf.status === "neutral" ||
    inf.status === "deflated"
  ) {
    return inf.confidence === "high" ? "LIVE" : "EARLY";
  }
  return "EARLY";
}

/** @deprecated Use {@link buildPhaseTag}. */
export function buildHumanSummary(status: MarketInflationStatus): string {
  switch (status) {
    case "not_started":
      return "PRE-DRAFT";
    case "low_sample":
      return "EARLY";
    case "inflated":
    case "neutral":
    case "deflated":
      return "LIVE";
    default:
      return "EARLY";
  }
}

/** Collapsed row label for market inflation — always the same label. */
export function formatInflationRowLabel(_inf: MarketInflationPressure): string {
  return "Market inflation";
}

/** Collapsed row value for market inflation. */
export function formatInflationRowValue(inf: MarketInflationPressure): string {
  switch (inf.status) {
    case "not_started":
      return "Not started";
    case "low_sample":
    case "inflated":
    case "neutral":
    case "deflated": {
      const pct = formatPercent(inf.percent);
      if (pct) return pct;
      if (inf.status === "inflated") return "Hot";
      if (inf.status === "deflated") return "Discounted";
      if (inf.status === "neutral") return "Balanced";
      return "—";
    }
    default:
      return inf.label || "—";
  }
}

/** @deprecated Use {@link formatInflationRowLabel}. */
export function formatInflationStatusLabel(
  inf: MarketInflationPressure,
): string {
  return formatInflationRowLabel(inf);
}

/** @deprecated Use {@link formatInflationRowValue}. */
export function formatInflationStatusValue(
  inf: MarketInflationPressure,
): string {
  return formatInflationRowValue(inf);
}

/** @deprecated Use collapsed {@link MarketPressureStatusRow} rows. */
export function formatInflationChipText(inf: MarketInflationPressure): string {
  const label = formatInflationRowLabel(inf);
  const value = formatInflationRowValue(inf);
  if (inf.status === "not_started") return value;
  return `${label} · ${value}`;
}

export function formatBudgetRowLabel(): string {
  return "Budget pressure";
}

export function formatBudgetRowValue(status: BudgetPressureStatus): string {
  switch (status) {
    case "tight":
      return "Tight";
    case "balanced":
      return "Balanced";
    case "loose":
      return "Loose";
    default:
      return "—";
  }
}

export function formatKeeperRowLabel(): string {
  return "Keeper compression";
}

export function formatKeeperRowValue(status: KeeperCompressionStatus): string {
  switch (status) {
    case "none":
      return "None";
    case "low":
      return "Low";
    case "moderate":
      return "Moderate";
    case "high":
      return "High";
    default:
      return "—";
  }
}

function buildStatusRows(
  inf: MarketInflationPressure,
  budget: MarketPressureSnapshot["budget_pressure"],
  keeper: MarketPressureSnapshot["keeper_compression"],
): MarketPressureStatusRows {
  return [
    {
      id: "market_inflation",
      label: formatInflationRowLabel(inf),
      value: formatInflationRowValue(inf),
      labelTone: "inflation",
      valueTone: inf.status === "not_started" ? "muted" : "inflation",
      title: [inf.explanation, MARKET_INFLATION_HELP_TEXT].join(" "),
    },
    {
      id: "budget_pressure",
      label: formatBudgetRowLabel(),
      value: formatBudgetRowValue(budget.status),
      labelTone: "budget",
      valueTone: "budget",
      title: budget.explanation,
    },
    {
      id: "keeper_compression",
      label: formatKeeperRowLabel(),
      value: formatKeeperRowValue(keeper.status),
      labelTone: "keeper",
      valueTone: "keeper",
      title: keeper.explanation,
    },
  ];
}

function legacyChipsFromEngine(
  inf: MarketInflationPressure,
  budget: MarketPressureSnapshot["budget_pressure"],
  keeper: MarketPressureSnapshot["keeper_compression"],
  rows: MarketPressureStatusRows,
): {
  inflationChip: MarketPressureStatusChip;
  budgetChip: MarketPressureStatusChip;
  keeperChip: MarketPressureStatusChip;
} {
  return {
    inflationChip: {
      id: "market_inflation",
      text: formatInflationChipText(inf),
      variant: "inflation",
      title: rows[0].title,
    },
    budgetChip: {
      id: "budget_pressure",
      text: formatBudgetChipText(budget.status),
      variant: "budget",
      title: rows[1].title,
    },
    keeperChip: {
      id: "keeper_compression",
      text: formatKeeperChipText(keeper.status),
      variant: "keeper",
      title: rows[2].title,
    },
  };
}

export function formatBudgetChipText(status: BudgetPressureStatus): string {
  switch (status) {
    case "tight":
      return "Budget tight";
    case "balanced":
      return "Budget balanced";
    case "loose":
      return "Budget loose";
    default:
      return "Budget";
  }
}

export function formatKeeperChipText(status: KeeperCompressionStatus): string {
  switch (status) {
    case "none":
      return "No keeper pressure";
    case "low":
      return "Keepers low";
    case "moderate":
      return "Keepers moderate";
    case "high":
      return "Keepers high";
    default:
      return "Keepers";
  }
}

function formatSummaryLine(
  budgetLeft: number,
  openSlots: number | null,
  playersRemaining: number,
): string {
  const slots = openSlots != null ? String(openSlots) : "—";
  return `$${Math.round(budgetLeft)} left · ${slots} slots · ${playersRemaining} players`;
}

/** Model details lead: league budget/slots/players; appends low sample when inflation is early. */
export function formatModelDetailsContextLine(
  budgetLeft: number,
  openSlots: number | null,
  playersRemaining: number,
  inf?: MarketInflationPressure,
): string {
  const base = formatSummaryLine(budgetLeft, openSlots, playersRemaining);
  if (inf?.status === "low_sample") return `${base} · low sample`;
  return base;
}

function formatMarketInflationPopoverMetric(inf: MarketInflationPressure): string {
  if (inf.status === "not_started") {
    return inf.label;
  }
  const parts: string[] = [];
  if (inf.ratio != null) parts.push(formatRatio(inf.ratio));
  const pct = formatPercent(inf.percent);
  if (pct) parts.push(pct);
  if (inf.confidence !== "none") parts.push(`${inf.confidence} confidence`);
  return parts.join(" · ");
}

function marketInflationPopoverExplanation(inf: MarketInflationPressure): string {
  if (inf.status === "not_started") {
    return "No auction picks yet — inflation tracks actual spend vs expected auction value.";
  }
  const n = inf.sample_size;
  return `Actual spend vs expected value across ${n} auction pick${n === 1 ? "" : "s"}.`;
}

function budgetPopoverMetric(
  allocatorFactor: number | null | undefined,
  budget: MarketPressureSnapshot["budget_pressure"],
): string {
  const parts = [`Surplus allocator ${formatRatio(allocatorFactor)}`];
  if (budget.cash_to_surplus_mass_ratio != null) {
    parts.push(`cash/surplus ${budget.cash_to_surplus_mass_ratio.toFixed(2)}×`);
  }
  return parts.join(" · ");
}

function detailGroupsFromEngine(
  mp: MarketPressureSnapshot,
  engineMarket: ValuationResponse,
  allocatorDisplay: string,
): MarketPressureDetailGroup[] {
  const inf = mp.market_inflation;
  const keeper = mp.keeper_compression;
  const budget = mp.budget_pressure;
  const allocatorFactor =
    engineMarket.context_v2?.market_summary.inflation_factor ??
    engineMarket.inflation_factor;
  const allocatorLabel = mp.allocator_vs_open.label || "Allocator vs Open";

  return [
    {
      id: "market_inflation",
      heading: "Market inflation",
      explanation: marketInflationPopoverExplanation(inf),
      metricLine: formatMarketInflationPopoverMetric(inf),
      title: [inf.explanation, MARKET_INFLATION_HELP_TEXT].join(" "),
    },
    {
      id: "budget_pressure",
      heading: "Budget pressure",
      explanation:
        "Remaining dollars compared with remaining active slots and surplus mass.",
      metricLine: budgetPopoverMetric(allocatorFactor, budget),
      title: budget.explanation,
    },
    {
      id: "keeper_compression",
      heading: "Keeper compression",
      explanation: `${keeper.active_keeper_count} of ${keeper.active_capacity} active slots are already filled by keepers.`,
      metricLine: `${(keeper.keeper_slot_fill_ratio * 100).toFixed(0)}% fill`,
      title: keeper.explanation,
    },
    {
      id: "model_comparator",
      heading: "Model comparator",
      explanation: MODEL_DETAILS_GUIDANCE,
      metricLine: `${allocatorLabel} ${allocatorDisplay}`,
      title: mp.allocator_vs_open.explanation ?? VS_AUCTION_OPEN_HELP_TEXT,
    },
  ];
}

/** @deprecated Legacy label/value rows for compatibility. */
function detailSectionsFromEngine(
  mp: MarketPressureSnapshot,
  engineMarket: ValuationResponse,
  allocatorDisplay: string,
): MarketPressureSection[] {
  const inf = mp.market_inflation;
  const keeper = mp.keeper_compression;
  const budget = mp.budget_pressure;
  const allocatorFactor =
    engineMarket.context_v2?.market_summary.inflation_factor ??
    engineMarket.inflation_factor;

  const rows: MarketPressureSection[] = [
    {
      id: "market_inflation_detail",
      label: "Market inflation",
      value: formatMarketInflationPopoverMetric(inf),
      title: [inf.explanation, MARKET_INFLATION_HELP_TEXT].join(" "),
    },
    {
      id: "surplus_allocator",
      label: "Surplus allocator",
      value: formatRatio(allocatorFactor),
      title:
        "Surplus allocation factor (replacement_slots_v2 inflation_factor). Not market inflation or allocator vs open.",
    },
  ];

  if (budget.cash_to_surplus_mass_ratio != null) {
    rows.push({
      id: "cash_pressure",
      label: "Cash / surplus mass",
      value: `${budget.cash_to_surplus_mass_ratio.toFixed(2)}×`,
      title: `Surplus cash $${Math.round(budget.surplus_cash)} vs total surplus mass $${Math.round(budget.total_surplus_mass ?? 0)}.`,
    });
  }

  rows.push({
    id: "allocator_vs_open",
    label: mp.allocator_vs_open.label || "Allocator vs Open",
    value: allocatorDisplay,
    title: mp.allocator_vs_open.explanation ?? VS_AUCTION_OPEN_HELP_TEXT,
  });

  rows.push({
    id: "keeper_compression_detail",
    label: "Keeper compression",
    value: `${keeper.active_keeper_count}/${keeper.active_capacity} slots · ${(keeper.keeper_slot_fill_ratio * 100).toFixed(0)}% fill`,
    title: keeper.explanation,
  });

  return rows;
}

function compactFromEngine(
  mp: MarketPressureSnapshot,
  engineMarket: ValuationResponse,
  options: BuildMarketPressureOptions,
): MarketPressureViewModel["compact"] {
  const inf = mp.market_inflation;
  const budget = mp.budget_pressure;
  const keeper = mp.keeper_compression;
  const openSlots =
    options.leagueWideOpenSlots ?? budget.remaining_active_slots;

  const playersRemaining = engineMarket.players_remaining;
  const statusRows = buildStatusRows(inf, budget, keeper);
  const phaseTag = buildPhaseTag(inf);
  const summaryLine = formatModelDetailsContextLine(
    budget.total_budget_remaining,
    openSlots,
    playersRemaining,
    inf,
  );
  return {
    phaseTag,
    humanSummary: phaseTag,
    statusRows,
    ...legacyChipsFromEngine(inf, budget, keeper, statusRows),
    summaryLine,
  };
}

function compactFromFallback(
  engineMarket: ValuationResponse,
  options: BuildMarketPressureOptions,
): MarketPressureViewModel["compact"] {
  const slots =
    options.leagueWideOpenSlots ??
    engineMarket.curve_inputs?.remaining_slots ??
    null;
  const keeperCount = options.keeperCount ?? 0;

  const keeperValue =
    keeperCount > 60
      ? "High"
      : keeperCount > 30
        ? "Moderate"
        : keeperCount > 0
          ? "Low"
          : "None";
  const statusRows: MarketPressureStatusRows = [
    {
      id: "market_inflation",
      label: "Market inflation",
      value: "Not started",
      labelTone: "neutral",
      valueTone: "muted",
      title: "Engine market_pressure unavailable",
    },
    {
      id: "budget_pressure",
      label: "Budget pressure",
      value: "Tight",
      labelTone: "budget",
      valueTone: "budget",
      title: "Limited fallback metrics only.",
    },
    {
      id: "keeper_compression",
      label: "Keeper compression",
      value: keeperValue,
      labelTone: "keeper",
      valueTone: "keeper",
      title: "Limited fallback metrics only.",
    },
  ];
  return {
    phaseTag: "PRE-DRAFT",
    humanSummary: "PRE-DRAFT",
    statusRows,
    inflationChip: {
      id: "market_inflation",
      text: "Not started",
      variant: "neutral",
    },
    budgetChip: {
      id: "budget_pressure",
      text: "Budget tight",
      variant: "budget",
    },
    keeperChip: {
      id: "keeper_compression",
      text:
        keeperValue === "High"
          ? "Keepers high"
          : keeperValue === "Moderate"
            ? "Keepers moderate"
            : keeperValue === "Low"
              ? "Keepers low"
              : "No keeper pressure",
      variant: "keeper",
    },
    summaryLine: formatSummaryLine(
      engineMarket.total_budget_remaining ?? 0,
      typeof slots === "number" && Number.isFinite(slots) ? slots : null,
      engineMarket.players_remaining ?? 0,
    ),
    fallbackNote:
      "Market pressure snapshot unavailable — limited fallback metrics shown.",
  };
}

function detailGroupsFromFallback(
  engineMarket: ValuationResponse,
  allocatorDisplay: string,
  options: BuildMarketPressureOptions,
): MarketPressureDetailGroup[] {
  const keeper = options.keeperCount ?? 0;
  const capacity = options.leagueSlotCapacity;
  const fill =
    capacity != null && capacity > 0
      ? `${((keeper / capacity) * 100).toFixed(0)}% fill`
      : "—";

  return [
    {
      id: "market_inflation",
      heading: "Market inflation",
      explanation: "Engine market_pressure unavailable — inflation from picks cannot be shown.",
      metricLine: "Not started",
    },
    {
      id: "budget_pressure",
      heading: "Budget pressure",
      explanation:
        "Remaining dollars compared with remaining active slots and surplus mass.",
      metricLine: `Surplus allocator ${formatRatio(engineMarket.inflation_factor)}`,
    },
    {
      id: "keeper_compression",
      heading: "Keeper compression",
      explanation:
        capacity != null
          ? `${keeper} of ${capacity} active slots are already filled by keepers.`
          : "Keeper count from draft board when engine snapshot is missing.",
      metricLine: fill,
    },
    {
      id: "model_comparator",
      heading: "Model comparator",
      explanation: MODEL_DETAILS_GUIDANCE,
      metricLine: `Allocator vs Open ${allocatorDisplay}`,
    },
  ];
}

function detailSectionsFromFallback(
  engineMarket: ValuationResponse,
  allocatorDisplay: string,
  options: BuildMarketPressureOptions,
): MarketPressureSection[] {
  const keeper = options.keeperCount ?? 0;
  const capacity = options.leagueSlotCapacity;
  const fill =
    capacity != null && capacity > 0
      ? `${((keeper / capacity) * 100).toFixed(0)}% fill`
      : "—";

  return [
    {
      id: "market_inflation_detail",
      label: "Market inflation",
      value: "Engine market_pressure unavailable",
    },
    {
      id: "surplus_allocator",
      label: "Surplus allocator",
      value: formatRatio(engineMarket.inflation_factor),
    },
    {
      id: "allocator_vs_open",
      label: "Allocator vs Open",
      value: allocatorDisplay,
    },
    {
      id: "keeper_compression_detail",
      label: "Keeper compression",
      value:
        capacity != null
          ? `${keeper}/${capacity} slots · ${fill}`
          : String(keeper),
    },
  ];
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

  const allocatorDisplay = formatRatio(idx ?? null);
  const allocatorSection: MarketPressureViewModel["allocatorVsOpen"] = {
    label: allocatorVsOpen?.label ?? "Allocator vs Open",
    displayValue: allocatorDisplay,
    title: allocatorVsOpen?.explanation ?? VS_AUCTION_OPEN_HELP_TEXT,
    helpText: VS_AUCTION_OPEN_HELP_TEXT,
  };

  if (mp) {
    const compact = compactFromEngine(mp, engineMarket, options);
    return {
      fromEngine: true,
      compact,
      modelDetailsContextLine: compact.summaryLine,
      detailGroups: detailGroupsFromEngine(mp, engineMarket, allocatorDisplay),
      details: detailSectionsFromEngine(mp, engineMarket, allocatorDisplay),
      detailGuidance: MODEL_DETAILS_GUIDANCE,
      primary: primarySectionsFromEngine(mp),
      secondary: secondarySectionsFromEngine(mp, engineMarket, options),
      allocatorVsOpen: allocatorSection,
    };
  }

  const compact = compactFromFallback(engineMarket, options);
  return {
    fromEngine: false,
    compact,
    modelDetailsContextLine: compact.summaryLine,
    detailGroups: detailGroupsFromFallback(
      engineMarket,
      allocatorDisplay,
      options,
    ),
    details: detailSectionsFromFallback(engineMarket, allocatorDisplay, options),
    detailGuidance: MODEL_DETAILS_GUIDANCE,
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
