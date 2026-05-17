import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import PlayerTable from "./PlayerTable";
import type { Player } from "../types/player";

vi.mock("../contexts/WatchlistContext", () => ({
  useWatchlist: () => ({
    addToWatchlist: vi.fn(),
    removeFromWatchlist: vi.fn(),
    isInWatchlist: () => false,
  }),
}));

afterEach(() => {
  cleanup();
});

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p-research-pos",
    mlbId: 42,
    name: "Research POS Row",
    team: "TST",
    position: "SS",
    positions: ["SS", "2B"],
    age: 27,
    value: 12,
    catalog_rank: 40,
    catalog_tier: 2,
    headshot: "",
    stats: {} as Player["stats"],
    projection: {} as Player["projection"],
    ...overrides,
  } as Player;
}

const researchSlots = [
  "C",
  "1B",
  "2B",
  "SS",
  "3B",
  "CI",
  "MI",
  "OF",
  "UTIL",
  "SP",
  "RP",
  "BN",
];

describe("PlayerTable research layout", () => {
  it("does not render the Slots line in the POS column", async () => {
    render(
      <PlayerTable
        columnLayout="research"
        players={[makePlayer()]}
        searchQuery=""
        onSearchChange={() => {}}
        positionFilter="all"
        onPositionChange={() => {}}
        draftDisplaySlotKeys={researchSlots}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Research POS Row")).toBeTruthy();
    });

    const row = screen.getByText("Research POS Row").closest("tr");
    expect(row).toBeTruthy();
    if (!row) throw new Error("expected table row");

    expect(within(row).queryByText("Slots")).toBeNull();
    expect(screen.queryByText("Slots")).toBeNull();
  });

  it("renders multiple primary position badges instead of slash text", async () => {
    render(
      <PlayerTable
        columnLayout="research"
        players={[makePlayer({ positions: ["SS", "3B", "OF"], position: "SS" })]}
        searchQuery=""
        onSearchChange={() => {}}
        positionFilter="all"
        onPositionChange={() => {}}
        draftDisplaySlotKeys={researchSlots}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Research POS Row")).toBeTruthy();
    });

    const row = screen.getByText("Research POS Row").closest("tr");
    expect(row).toBeTruthy();
    if (!row) throw new Error("expected table row");

    const posCell = row.querySelector(".td-pos");
    expect(posCell).toBeTruthy();
    if (!posCell) throw new Error("expected POS cell");

    expect(within(posCell as HTMLElement).queryByText("SS / 3B / OF")).toBeNull();
    expect(within(posCell as HTMLElement).getAllByText("SS").length).toBeGreaterThanOrEqual(1);
    expect(within(posCell as HTMLElement).getByText("3B")).toBeTruthy();
    expect(within(posCell as HTMLElement).getByText("OF")).toBeTruthy();
  });
});
