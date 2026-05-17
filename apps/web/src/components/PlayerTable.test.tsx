import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("de-emphasizes drafted rows without strong highlight styling", async () => {
    render(
      <PlayerTable
        columnLayout="research"
        players={[
          makePlayer({ id: "free", name: "Available Player" }),
          makePlayer({
            id: "sold",
            name: "Drafted Player",
            valuation_eligible: false,
          }),
        ]}
        draftedIds={new Set(["sold"])}
        draftedByTeam={new Map([["sold", "Team H"]])}
        draftedPriceByPlayerId={new Map([["sold", 15]])}
        searchQuery=""
        onSearchChange={() => {}}
        positionFilter="all"
        onPositionChange={() => {}}
        draftDisplaySlotKeys={researchSlots}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Drafted Player")).toBeTruthy();
    });

    const draftedRow = screen.getByText("Drafted Player").closest("tr");
    expect(draftedRow?.className).toContain("pt-row--research-drafted");
    expect(draftedRow?.className).not.toContain("pt-row--research-rostered-won");

    const draftResult = draftedRow?.querySelector(".pt-research-draft-result");
    expect(draftResult?.textContent).toContain("Team H");
    expect(draftResult?.textContent).toContain("$15");
    expect(draftResult?.querySelector(".pt-research-draft-result__tag")).toBeNull();

    const availableRow = screen.getByText("Available Player").closest("tr");
    expect(availableRow?.className).not.toContain("pt-row--research-drafted");
  });

  it("hides drafted players when availability is Available only", async () => {
    const user = userEvent.setup();
    render(
      <PlayerTable
        columnLayout="research"
        players={[
          makePlayer({ id: "free", name: "Available Player" }),
          makePlayer({ id: "sold", name: "Drafted Player" }),
        ]}
        draftedIds={new Set(["sold"])}
        draftedByTeam={new Map([["sold", "Team H"]])}
        draftedPriceByPlayerId={new Map([["sold", 15]])}
        searchQuery=""
        onSearchChange={() => {}}
        positionFilter="all"
        onPositionChange={() => {}}
        draftDisplaySlotKeys={researchSlots}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Drafted Player")).toBeTruthy();
    });

    await user.click(screen.getByLabelText("Availability filter"));
    await user.click(screen.getByRole("option", { name: "Available" }));

    await waitFor(() => {
      expect(screen.queryByText("Drafted Player")).toBeNull();
      expect(screen.getByText("Available Player")).toBeTruthy();
    });
  });
});
