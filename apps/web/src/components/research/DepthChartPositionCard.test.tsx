import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DepthChartPositionCard } from "./DepthChartPositionCard";
import type { DepthChartSlotViewModel } from "./DepthChartPositionCard";

afterEach(() => {
  cleanup();
});

function slot(
  rank: 1 | 2 | 3,
  overrides: Partial<DepthChartSlotViewModel> = {},
): DepthChartSlotViewModel {
  return {
    rank,
    catalogPlayer: null,
    row:
      rank === 1
        ? {
            rank: 1,
            playerId: 1,
            playerName: "Cam Schlittler",
            primaryPosition: "P",
            status: "Active",
            usageStarts: 1,
            usageAppearances: 7,
            outOfPosition: false,
            needsManualReview: false,
            reasons: [],
          }
        : rank === 2
          ? {
              rank: 2,
              playerId: 2,
              playerName: "Will Warren",
              primaryPosition: "P",
              status: "Active",
              usageStarts: 1,
              usageAppearances: 7,
              outOfPosition: false,
              needsManualReview: false,
              reasons: [],
            }
          : rank === 3
            ? {
                rank: 3,
                playerId: 3,
                playerName: "Spencer Jones",
                primaryPosition: "RF",
                status: "Active",
                usageStarts: 0,
                usageAppearances: 7,
                outOfPosition: false,
                needsManualReview: false,
                reasons: [],
              }
            : null,
    matchState:
      rank === 1 ? "valued" : rank === 2 ? "valued" : rank === 3 ? "catalog_only" : null,
    rightDisplay:
      rank === 1
        ? { kind: "auction", formattedValue: "$5" }
        : rank === 2
          ? { kind: "auction", formattedValue: "$1" }
          : rank === 3
            ? { kind: "dash" }
            : null,
    watchlistEnabled: rank === 1,
    watchlistStarred: false,
    ...overrides,
  };
}

describe("DepthChartPositionCard", () => {
  it("renders position header and assignment count", () => {
    render(
      <DepthChartPositionCard
        position="SP"
        slots={[slot(1), slot(2), slot(3)]}
        onPlayerClick={vi.fn()}
        onStarToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("SP")).toBeTruthy();
    expect(screen.getByText("Starting Pitcher")).toBeTruthy();
    expect(screen.getByText("3/3")).toBeTruthy();
  });

  it("renders auction values for valued rows instead of Valued badge", () => {
    render(
      <DepthChartPositionCard
        position="SP"
        slots={[slot(1), slot(2), slot(3)]}
        onPlayerClick={vi.fn()}
        onStarToggle={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Value").length).toBe(2);
    expect(screen.getByText("$5")).toBeTruthy();
    expect(screen.getByText("$1")).toBeTruthy();
    expect(screen.queryByText("Valued")).toBeNull();
    expect(screen.getByLabelText("Not in valuation pool")).toBeTruthy();
  });

  it("renders rostered row with dollar value", () => {
    render(
      <DepthChartPositionCard
        position="RF"
        slots={[
          slot(1, {
            row: {
              rank: 1,
              playerId: 592450,
              playerName: "Aaron Judge",
              primaryPosition: "RF",
              status: "Active",
              usageStarts: 0,
              usageAppearances: 7,
              outOfPosition: false,
              needsManualReview: false,
              reasons: [],
            },
            matchState: "rostered",
            rightDisplay: {
              kind: "rostered_won",
              teamName: "Team B",
              formattedPrice: "$35",
            },
            watchlistEnabled: true,
          }),
          slot(2),
          slot(3),
        ]}
        onPlayerClick={vi.fn()}
        onStarToggle={vi.fn()}
      />,
    );
    const rosteredRow = screen.getByText("Aaron Judge").closest(".depth-player-row");
    expect(rosteredRow).toBeTruthy();
    expect(within(rosteredRow!).getByText("Team B")).toBeTruthy();
    expect(within(rosteredRow!).getByText("$35")).toBeTruthy();
    expect(within(rosteredRow!).queryByText("Value")).toBeNull();
    expect(within(rosteredRow!).queryByText("Paid")).toBeNull();
    expect(screen.queryByText("Rostered")).toBeNull();
  });

  it("renders Depth only and Unmatched status badges", () => {
    render(
      <DepthChartPositionCard
        position="SP"
        slots={[
          slot(1, {
            row: {
              rank: 1,
              playerId: 888,
              playerName: "Unknown Arm",
              primaryPosition: "P",
              status: "Active",
              usageStarts: 0,
              usageAppearances: 0,
              outOfPosition: false,
              needsManualReview: false,
              reasons: [],
            },
            matchState: "depth_only",
            rightDisplay: {
              kind: "status",
              label: "Depth only",
              state: "depth_only",
              title: "depth",
            },
            watchlistEnabled: false,
          }),
          slot(2, {
            row: {
              rank: 2,
              playerId: 0,
              playerName: "Unknown",
              primaryPosition: "P",
              status: "Active",
              usageStarts: 0,
              usageAppearances: 0,
              outOfPosition: false,
              needsManualReview: true,
              reasons: [],
            },
            matchState: "unmatched",
            rightDisplay: {
              kind: "status",
              label: "Unmatched",
              state: "unmatched",
              title: "unmatched",
            },
            watchlistEnabled: false,
          }),
          slot(3),
        ]}
        onPlayerClick={vi.fn()}
        onStarToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("Depth only")).toBeTruthy();
    expect(screen.getByText("Unmatched")).toBeTruthy();
  });

  it("does not render watchlist star when not actionable", () => {
    render(
      <DepthChartPositionCard
        position="SP"
        slots={[slot(2), slot(3), slot(3)]}
        onPlayerClick={vi.fn()}
        onStarToggle={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /watchlist/i })).toBeNull();
  });

  it("calls onPlayerClick when row is clicked", async () => {
    const user = userEvent.setup();
    const onPlayerClick = vi.fn();
    render(
      <DepthChartPositionCard
        position="SP"
        slots={[slot(1), slot(2), slot(3)]}
        onPlayerClick={onPlayerClick}
        onStarToggle={vi.fn()}
      />,
    );
    await user.click(screen.getByText("Cam Schlittler"));
    expect(onPlayerClick).toHaveBeenCalled();
  });
});
