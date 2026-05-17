import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CommandCenterRightBidContextCard } from "./CommandCenterRightBidContextCard";

describe("CommandCenterRightBidContextCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders three budget summary rows", () => {
    const { container } = render(
      <CommandCenterRightBidContextCard
        maxBid={169}
        budgetLeft={182}
        dollarsPerSpot={13}
      />,
    );
    expect(screen.getByText("BID CONTEXT")).toBeTruthy();
    expect(screen.getByText("Budget max")).toBeTruthy();
    expect(screen.getByText("$169")).toBeTruthy();
    expect(screen.getByText("Budget left")).toBeTruthy();
    expect(screen.getByText("$182")).toBeTruthy();
    expect(screen.getByText("$/slot")).toBeTruthy();
    expect(screen.getByText("$13")).toBeTruthy();
    expect(container.querySelectorAll(".mp-summary-row")).toHaveLength(3);
    expect(screen.queryByText("Open slots")).toBeNull();
  });

  it("renders em dash for missing values", () => {
    render(
      <CommandCenterRightBidContextCard
        maxBid={undefined}
        budgetLeft={182}
        dollarsPerSpot={undefined}
      />,
    );
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
