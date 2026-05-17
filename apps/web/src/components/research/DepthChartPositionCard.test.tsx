import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
          : null,
    matchState: rank === 1 ? "valued" : rank === 2 ? "depth_only" : null,
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
    expect(screen.getByText("2/3")).toBeTruthy();
  });

  it("renders Valued and Depth only badges", () => {
    render(
      <DepthChartPositionCard
        position="SP"
        slots={[slot(1), slot(2), slot(3)]}
        onPlayerClick={vi.fn()}
        onStarToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("Valued")).toBeTruthy();
    expect(screen.getByText("Depth only")).toBeTruthy();
    expect(screen.getByText("Cam Schlittler")).toBeTruthy();
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

  it("calls onPlayerClick for unmatched row without crashing", async () => {
    const user = userEvent.setup();
    const onPlayerClick = vi.fn();
    render(
      <DepthChartPositionCard
        position="SP"
        slots={[
          slot(1, {
            row: {
              rank: 1,
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
            watchlistEnabled: false,
          }),
          slot(2),
          slot(3),
        ]}
        onPlayerClick={onPlayerClick}
        onStarToggle={vi.fn()}
      />,
    );
    await user.click(screen.getByText("Unknown"));
    expect(onPlayerClick).toHaveBeenCalled();
    expect(screen.getByText("Unmatched")).toBeTruthy();
  });
});
