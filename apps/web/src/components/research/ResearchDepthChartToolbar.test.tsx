import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ResearchDepthChartToolbar } from "./ResearchDepthChartToolbar";
import type { DepthChartMatchSummary } from "../../domain/depthChartRowMatch";
import { MLB_TEAMS } from "../../data/mlbTeams";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const matchSummary: DepthChartMatchSummary = {
  totalRows: 33,
  valuedCatalogMatches: 29,
  depthOnly: 0,
  unmatched: 1,
  rostered: 3,
  valued: 23,
  catalogOnly: 6,
};

const defaultProps = {
  teams: MLB_TEAMS,
  selectedTeamId: 147,
  onTeamChange: vi.fn(),
  onRefresh: vi.fn(),
  generatedAt: "2026-05-17T18:57:20.000Z",
  rosterCount: 26,
  rosterLimit: 26,
  assignmentCount: 32,
  assignmentCapacity: 33,
  rosterLimitNote: "Active roster (26) is within 26-man limit",
  rosterLimitOk: true,
  matchSummary,
  useValuationBreakdown: true,
  searchQuery: "",
  onSearchChange: vi.fn(),
};

describe("ResearchDepthChartToolbar", () => {
  beforeEach(() => {
    vi.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue("2:57 PM");
    vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue(
      "5/17/2026, 2:57:20 PM",
    );
  });

  it("renders title and subtitle", () => {
    render(<ResearchDepthChartToolbar {...defaultProps} />);
    expect(screen.getByRole("heading", { name: "Depth Charts" })).toBeTruthy();
    expect(
      screen.getByText(
        "Daily active-roster depth with starter / backup / reserve rankings.",
      ),
    ).toBeTruthy();
  });

  it("renders team selector and refresh in the header", () => {
    render(<ResearchDepthChartToolbar {...defaultProps} />);
    expect(screen.getByText("MLB team")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "MLB team to show on depth chart" }),
    ).toBeTruthy();
  });

  it("renders search with compact width row placeholder", () => {
    render(<ResearchDepthChartToolbar {...defaultProps} />);
    const search = screen.getByRole("textbox", {
      name: "Search depth chart players",
    });
    expect(search.getAttribute("placeholder")).toBe(
      "Search depth chart players...",
    );
    expect(search.className).toContain("pt-search-input");
    expect(
      search.closest(".depth-chart-page-header__search-status-row"),
    ).toBeTruthy();
  });

  it("renders status chips for updated, roster, assignments, and active roster", () => {
    render(<ResearchDepthChartToolbar {...defaultProps} />);
    const status = screen.getByLabelText("Depth chart data status");
    expect(within(status).getByText(/Updated 2:57 PM/)).toBeTruthy();
    expect(within(status).getByText("Roster 26/26")).toBeTruthy();
    expect(within(status).getByText("Assignments 32/33")).toBeTruthy();
    expect(within(status).getByText("Active roster OK")).toBeTruthy();
  });

  it("shows warning chips when roster is over limit", () => {
    render(
      <ResearchDepthChartToolbar
        {...defaultProps}
        rosterCount={27}
        rosterLimitOk={false}
      />,
    );
    const status = screen.getByLabelText("Depth chart data status");
    expect(within(status).getByText("Roster 27/26").className).toContain(
      "is-warning",
    );
    expect(within(status).getByText("Over limit").className).toContain(
      "is-warning",
    );
  });

  it("renders match breakdown as status chips", () => {
    render(<ResearchDepthChartToolbar {...defaultProps} />);
    const status = screen.getByLabelText("Depth chart data status");
    expect(within(status).getByText("23 valued")).toBeTruthy();
    expect(within(status).getByText("6 catalog-only")).toBeTruthy();
    expect(within(status).getByText("3 rostered")).toBeTruthy();
    expect(within(status).getByText("0 depth-only")).toBeTruthy();
    expect(within(status).getByText("1 unmatched").className).toContain(
      "is-warning",
    );
  });

  it("does not render Details toggle", () => {
    render(<ResearchDepthChartToolbar {...defaultProps} />);
    expect(screen.queryByRole("button", { name: "Details" })).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Depth chart details" }),
    ).toBeNull();
  });
});
