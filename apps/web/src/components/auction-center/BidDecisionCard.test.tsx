import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ValuationResult } from "../../api/engine";
import type { Player } from "../../types/player";
import type { CommandCenterWalletCaps } from "../../utils/valuation";
import {
  COMMAND_CENTER_BID_EDGE_TOOLTIP,
  COMMAND_CENTER_TOOLTIP_AUCTION_VALUE,
  COMMAND_CENTER_TOOLTIP_SUGGESTED_BID,
  COMMAND_CENTER_TOOLTIP_TEAM_VALUE,
  COMMAND_CENTER_WHY_ROSTER_FIT_LINE,
  RECOMMENDED_BID_CAPPED_LABEL,
} from "../../utils/valuation";
import { BidDecisionCard } from "./BidDecisionCard";

const player: Player = {
  id: "p1",
  mlbId: 1,
  name: "Max Fried",
  team: "NYY",
  position: "SP",
  age: 30,
  catalog_rank: 12,
  value: 40,
  catalog_tier: 1,
  headshot: "",
  stats: {},
  projection: {},
  outlook: "",
};

const valuationRow: ValuationResult = {
  player_id: "p1",
  auction_value: 7,
  recommended_bid: 8,
  team_value: 14,
  baseline_value: 10,
  edge: 7,
  inflation_factor: 1,
  calculated_at: "2026-01-01",
};

describe("BidDecisionCard", () => {
  it("renders four bid metrics without ladder helper line", () => {
    render(
      <BidDecisionCard
        valuationRow={valuationRow}
        selectedPlayer={player}
        engineBoardPhase="ready"
      />,
    );
    expect(screen.getByText("Auction Value")).toBeTruthy();
    expect(
      document.querySelector(
        '[aria-label="Auction value, suggested bid, your team value, bid edge"]',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Your team value/i)).toBeTruthy();
    expect(screen.getByText("Bid edge")).toBeTruthy();
    expect(screen.getByText("$8")).toBeTruthy();
    expect(screen.getByText("+$6")).toBeTruthy();
    expect(screen.queryByText(/league-wide FMV/i)).toBeNull();
    expect(screen.queryByText("Auction FMV")).toBeNull();
  });

  it("exposes whole-tile hover tooltips on bid metrics", () => {
    const { container } = render(
      <BidDecisionCard
        valuationRow={valuationRow}
        selectedPlayer={player}
        engineBoardPhase="ready"
      />,
    );
    expect(container.querySelectorAll(".bdc-metric-tile-label-info").length).toBe(
      0,
    );
    expect(
      container.querySelector(
        `.bdc-metric-tile[title="${COMMAND_CENTER_TOOLTIP_AUCTION_VALUE}"]`,
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        `.bdc-metric-tile[title="${COMMAND_CENTER_TOOLTIP_SUGGESTED_BID}"]`,
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        `.bdc-metric-tile[title="${COMMAND_CENTER_TOOLTIP_TEAM_VALUE}"]`,
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        `.bdc-metric-tile[title="${COMMAND_CENTER_BID_EDGE_TOOLTIP}"]`,
      ),
    ).toBeTruthy();
  });

  it("keeps Why this bid closed by default", () => {
    render(
      <BidDecisionCard
        valuationRow={valuationRow}
        selectedPlayer={player}
        engineBoardPhase="ready"
      />,
    );
    expect(screen.getByText("Why this bid?")).toBeTruthy();
    expect(document.querySelector(".bdc-why-bid[open]")).toBeNull();
  });

  it("shows plain summary and model details when Why this bid is expanded", async () => {
    const user = userEvent.setup();
    render(
      <BidDecisionCard
        valuationRow={valuationRow}
        selectedPlayer={player}
        engineBoardPhase="ready"
      />,
    );
    await user.click(screen.getByText("Why this bid?"));
    expect(document.querySelector(".bdc-why-bid[open]")).toBeTruthy();
    expect(screen.getByText(COMMAND_CENTER_WHY_ROSTER_FIT_LINE)).toBeTruthy();
    expect(screen.getByText(/Aim near \$8/)).toBeTruthy();
    expect(screen.getByText("Model and engine details")).toBeTruthy();
    expect(document.querySelector(".bdc-why-technical")).toBeNull();
    expect(screen.getByText("Baseline Strength")).toBeTruthy();
  });

  it("shows capped suggested bid label and wallet-limited amount when caps bind", () => {
    const cappedRow: ValuationResult = {
      ...valuationRow,
      recommended_bid: 35,
      team_value: 40,
      auction_value: 20,
    };
    const caps: CommandCenterWalletCaps = {
      maxBid: 18,
      budgetRemaining: 40,
      openSpots: 3,
    };
    render(
      <BidDecisionCard
        valuationRow={cappedRow}
        selectedPlayer={player}
        engineBoardPhase="ready"
        walletCaps={caps}
      />,
    );
    expect(screen.getByText(RECOMMENDED_BID_CAPPED_LABEL)).toBeTruthy();
    expect(screen.getByText("$18")).toBeTruthy();
    expect(screen.queryByText(/^Suggested bid$/)).toBeNull();
  });

  it("can collapse Why this bid disclosure", async () => {
    const user = userEvent.setup();
    render(
      <BidDecisionCard
        valuationRow={valuationRow}
        selectedPlayer={player}
        engineBoardPhase="ready"
      />,
    );
    await user.click(screen.getByText("Why this bid?"));
    expect(document.querySelector(".bdc-why-bid[open]")).toBeTruthy();
    await user.click(screen.getByText("Why this bid?"));
    expect(document.querySelector(".bdc-why-bid[open]")).toBeNull();
  });
});

afterEach(() => {
  cleanup();
});
