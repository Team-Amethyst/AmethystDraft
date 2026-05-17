import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MarketPressureViewModel } from "../../pages/commandCenterMarket";
import { CommandCenterRightMarketPressureCard } from "./CommandCenterRightMarketPressureCard";
import { MODEL_DETAILS_GUIDANCE } from "../../pages/commandCenterMarket";

function preDraftVm(): MarketPressureViewModel {
  return {
    fromEngine: true,
    compact: {
      phaseTag: "PRE-DRAFT",
      humanSummary: "PRE-DRAFT",
      statusRows: [
        {
          id: "market_inflation",
          label: "Market inflation",
          value: "Not started",
          labelTone: "inflation",
          valueTone: "muted",
        },
        {
          id: "budget_pressure",
          label: "Budget pressure",
          value: "Tight",
          labelTone: "budget",
          valueTone: "budget",
        },
        {
          id: "keeper_compression",
          label: "Keeper compression",
          value: "High",
          labelTone: "keeper",
          valueTone: "keeper",
        },
      ],
      inflationChip: {
        id: "market_inflation",
        text: "Not started",
        variant: "inflation",
      },
      budgetChip: {
        id: "budget_pressure",
        text: "Budget tight",
        variant: "budget",
      },
      keeperChip: {
        id: "keeper_compression",
        text: "Keepers high",
        variant: "keeper",
      },
      summaryLine: "$1422 left · 113 slots · 786 players",
    },
    modelDetailsContextLine: "$1422 left · 113 slots · 786 players",
    detailGroups: [
      {
        id: "market_inflation",
        heading: "Market inflation",
        explanation: "No auction picks yet.",
        metricLine: "Not started",
      },
      {
        id: "budget_pressure",
        heading: "Budget pressure",
        explanation:
          "Remaining dollars compared with remaining active slots and surplus mass.",
        metricLine: "Surplus allocator 0.25×",
      },
      {
        id: "keeper_compression",
        heading: "Keeper compression",
        explanation: "76 of 189 active slots are already filled by keepers.",
        metricLine: "40% fill",
      },
      {
        id: "model_comparator",
        heading: "Model comparator",
        explanation: MODEL_DETAILS_GUIDANCE,
        metricLine: "Allocator vs Open 1.00×",
      },
    ],
    details: [],
    detailGuidance: MODEL_DETAILS_GUIDANCE,
    primary: [],
    secondary: [],
    allocatorVsOpen: {
      label: "Allocator vs Open",
      displayValue: "1.00×",
      helpText: "long",
    },
  };
}

function afterPick10Vm(): MarketPressureViewModel {
  return {
    fromEngine: true,
    compact: {
      phaseTag: "EARLY",
      humanSummary: "EARLY",
      statusRows: [
        {
          id: "market_inflation",
          label: "Market inflation",
          value: "+350%",
          labelTone: "inflation",
          valueTone: "inflation",
          title: "10 picks sampled",
        },
        {
          id: "budget_pressure",
          label: "Budget pressure",
          value: "Tight",
          labelTone: "budget",
          valueTone: "budget",
        },
        {
          id: "keeper_compression",
          label: "Keeper compression",
          value: "High",
          labelTone: "keeper",
          valueTone: "keeper",
        },
      ],
      inflationChip: {
        id: "market_inflation",
        text: "Market inflation · +350%",
        variant: "inflation",
        title: "10 picks sampled",
      },
      budgetChip: {
        id: "budget_pressure",
        text: "Budget tight",
        variant: "budget",
      },
      keeperChip: {
        id: "keeper_compression",
        text: "Keepers high",
        variant: "keeper",
      },
      summaryLine: "$1139 left · 103 slots · 778 players · low sample",
    },
    modelDetailsContextLine:
      "$1139 left · 103 slots · 778 players · low sample",
    detailGroups: [
      {
        id: "market_inflation",
        heading: "Market inflation",
        explanation: "Actual spend vs expected value across 10 auction picks.",
        metricLine: "4.50× · +350% · medium confidence",
      },
      {
        id: "budget_pressure",
        heading: "Budget pressure",
        explanation:
          "Remaining dollars compared with remaining active slots and surplus mass.",
        metricLine: "Surplus allocator 0.25× · cash/surplus 0.18×",
      },
      {
        id: "keeper_compression",
        heading: "Keeper compression",
        explanation: "76 of 189 active slots are already filled by keepers.",
        metricLine: "40% fill",
      },
      {
        id: "model_comparator",
        heading: "Model comparator",
        explanation: MODEL_DETAILS_GUIDANCE,
        metricLine: "Allocator vs Open 1.00×",
      },
    ],
    details: [],
    detailGuidance: MODEL_DETAILS_GUIDANCE,
    primary: [],
    secondary: [],
    allocatorVsOpen: {
      label: "Allocator vs Open",
      displayValue: "1.00×",
      helpText: "long",
    },
  };
}

describe("CommandCenterRightMarketPressureCard", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("renders collapsed pre_draft copy with phase tag", () => {
    const { container } = render(
      <CommandCenterRightMarketPressureCard marketPressure={preDraftVm()} />,
    );
    expect(screen.getByText("MARKET PRESSURE")).toBeTruthy();
    expect(screen.getByText("PRE-DRAFT")).toBeTruthy();
    expect(screen.queryByText("Early market read")).toBeNull();
    expect(screen.queryByText("Pre-draft market")).toBeNull();
    expect(screen.getByText("Market inflation")).toBeTruthy();
    expect(screen.getByText("Not started")).toBeTruthy();
    expect(screen.getByText("Budget pressure")).toBeTruthy();
    expect(screen.getByText("Tight")).toBeTruthy();
    expect(screen.getByText("Keeper compression")).toBeTruthy();
    expect(screen.getByText("High")).toBeTruthy();
    expect(screen.queryByText("$1422 left · 113 slots · 786 players")).toBeNull();
    expect(screen.getByRole("button", { name: /Model details/ })).toBeTruthy();
    expect(container.querySelector(".engine-market-card")).toBeNull();
    expect(container.querySelector(".mp-status-dashboard")).toBeNull();
    expect(container.querySelector(".mp-status-pill")).toBeNull();
    expect(container.querySelectorAll(".mp-summary-row")).toHaveLength(3);
    expect(container.querySelector(".mp-model-details-popover")).toBeNull();
    expect(screen.queryByText("Surplus allocator")).toBeNull();
    expect(screen.queryByText("Low sample market")).toBeNull();
  });

  it("renders collapsed after_pick_10 copy with EARLY tag and inflation context", () => {
    const { container } = render(
      <CommandCenterRightMarketPressureCard marketPressure={afterPick10Vm()} />,
    );
    expect(screen.getByText("EARLY")).toBeTruthy();
    expect(screen.queryByText("Early market read")).toBeNull();
    expect(screen.queryByText("Low sample market")).toBeNull();
    expect(screen.getByText("Market inflation")).toBeTruthy();
    expect(screen.getByText("+350%")).toBeTruthy();
    expect(screen.queryByText(/low sample/)).toBeNull();
    expect(screen.getByText("Budget pressure")).toBeTruthy();
    expect(screen.getByText("Keeper compression")).toBeTruthy();
    expect(screen.queryByText("$1139 left · 103 slots · 778 players")).toBeNull();
    expect(container.querySelector(".engine-market-card")).toBeNull();
    expect(container.querySelectorAll(".mp-summary-row")).toHaveLength(3);
    expect(container.querySelector(".mp-phase-tag")).toBeTruthy();
  });

  it("opens model details popover with four explanation groups", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CommandCenterRightMarketPressureCard marketPressure={afterPick10Vm()} />,
    );

    const trigger = screen.getByRole("button", { name: /Model details/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".engine-market-card")).toBeNull();

    const popover = document.body.querySelector(".mp-model-details-popover");
    expect(popover).toBeTruthy();
    expect(
      screen.getByText("$1139 left · 103 slots · 778 players · low sample"),
    ).toBeTruthy();
    expect(popover?.querySelectorAll(".mp-model-details-group")).toHaveLength(4);
    expect(
      screen.getByText("Actual spend vs expected value across 10 auction picks."),
    ).toBeTruthy();
    expect(screen.getByText("4.50× · +350% · medium confidence")).toBeTruthy();
    expect(
      screen.getByText(
        "Remaining dollars compared with remaining active slots and surplus mass.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("76 of 189 active slots are already filled by keepers."),
    ).toBeTruthy();
    expect(screen.getByText("Model comparator")).toBeTruthy();
    expect(screen.getByText("Allocator vs Open 1.00×")).toBeTruthy();
    expect(screen.getByText(/It is not live market inflation/)).toBeTruthy();
    expect(popover?.querySelectorAll(".mp-model-details-row")).toHaveLength(0);
    expect(screen.queryByText(/inflation index/i)).toBeNull();
    expect(screen.queryByText("Surplus allocator")).toBeNull();
  });

  it("closes popover on Escape", async () => {
    const user = userEvent.setup();
    render(<CommandCenterRightMarketPressureCard marketPressure={afterPick10Vm()} />);
    await user.click(screen.getByRole("button", { name: /Model details/ }));
    expect(document.body.querySelector(".mp-model-details-popover")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(document.body.querySelector(".mp-model-details-popover")).toBeNull();
  });

  it("fallback stays compact without nested panels", async () => {
    const user = userEvent.setup();
    const vm: MarketPressureViewModel = {
      ...preDraftVm(),
      fromEngine: false,
      compact: {
        ...preDraftVm().compact,
        fallbackNote:
          "Market pressure snapshot unavailable — limited fallback metrics shown.",
      },
    };
    const { container } = render(
      <CommandCenterRightMarketPressureCard marketPressure={vm} />,
    );
    expect(
      screen.getByText(/Market pressure snapshot unavailable/),
    ).toBeTruthy();
    expect(container.querySelector(".engine-market-card")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Model details/ }));
    expect(document.body.querySelector(".mp-model-details-popover")).toBeTruthy();
  });
});
