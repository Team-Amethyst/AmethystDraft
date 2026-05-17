import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Player } from "../types/player";
import TiersView from "./TiersView";

function player(partial: Partial<Player> & { id: string }): Player {
  return {
    id: partial.id,
    mlbId: 1,
    name: partial.name ?? partial.id,
    team: "SEA",
    position: partial.position ?? "OF",
    age: 28,
    catalog_rank: 1,
    catalog_tier: 1,
    value: 1,
    headshot: "",
    stats: {},
    ...partial,
  } as Player;
}

const noop = () => {};

afterEach(() => cleanup());

describe("TiersView", () => {
  it("renders T1–T5 tier labels and semantic subtitles", () => {
    render(
      <TiersView
        players={[
          player({
            id: "p1",
            name: "Star",
            auction_tier: 1,
            auction_value: 17,
          }),
          player({
            id: "p2",
            name: "Depth",
            auction_tier: 2,
            auction_value: 9,
          }),
        ]}
        draftedIds={new Set()}
        onPlayerClick={noop}
        isInWatchlist={() => false}
        addToWatchlist={noop}
        removeFromWatchlist={noop}
      />,
    );

    expect(screen.getByText("Auction tiers")).toBeTruthy();
    expect(screen.getByText(/Model-generated auction tiers/i)).toBeTruthy();
    expect(screen.getByText("Tier 1")).toBeTruthy();
    expect(screen.getByText(/Elite targets/i)).toBeTruthy();
    expect(screen.getByText("Tier 2")).toBeTruthy();
    expect(screen.queryByText(/Leaders/i)).toBeNull();
    expect(screen.queryByText(/Starter targets/i)).toBeNull();
  });

  it("shows value range, avg, and cliff in collapsed tier summary", () => {
    render(
      <TiersView
        players={[
          player({ id: "p1", auction_tier: 1, auction_value: 17 }),
          player({ id: "p2", auction_tier: 1, auction_value: 15 }),
          player({ id: "p3", auction_tier: 2, auction_value: 9 }),
        ]}
        draftedIds={new Set()}
        onPlayerClick={noop}
        isInWatchlist={() => false}
        addToWatchlist={noop}
        removeFromWatchlist={noop}
      />,
    );

    expect(screen.getByText(/\$15–\$17/)).toBeTruthy();
    expect(screen.getByText(/drop after tier/i)).toBeTruthy();
  });

  it("expanded row matches research columns and opens player on row click", async () => {
    const user = userEvent.setup();
    const onPlayerClick = vi.fn();
    render(
      <TiersView
        players={[
          player({
            id: "p1",
            name: "Julio Rodríguez",
            auction_tier: 1,
            auction_value: 17,
            auction_rank: 1,
            market_adp: 9.47,
          }),
        ]}
        draftedIds={new Set()}
        onPlayerClick={onPlayerClick}
        isInWatchlist={() => false}
        addToWatchlist={noop}
        removeFromWatchlist={noop}
      />,
    );

    await user.click(screen.getByRole("button", { name: /expand tier 1/i }));

    const table = document.querySelector(".tier-table")!;
    expect(within(table).getByText("Market ADP")).toBeTruthy();
    expect(within(table).getByText("Auction rank")).toBeTruthy();
    expect(within(table).getByText("Notes")).toBeTruthy();
    expect(
      table.querySelector(".pt-value-stack__primary")?.textContent,
    ).toBe("$17");
    expect(table.querySelector(".td-auction-rank")?.textContent).toBe("1");
    expect(table.querySelector(".td-adp")?.textContent).toBe("9.47");
    expect(screen.queryByRole("button", { name: /queue/i })).toBeNull();

    await user.click(screen.getByText("Julio Rodríguez"));
    expect(onPlayerClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", name: "Julio Rodríguez" }),
    );
  });

  it("marks drafted players and excludes them from left count", async () => {
    const user = userEvent.setup();
    render(
      <TiersView
        players={[
          player({ id: "a", auction_tier: 1, auction_value: 17, name: "Active" }),
          player({
            id: "b",
            name: "Sold",
            auction_tier: 1,
            auction_value: undefined as unknown as number,
            valuation_eligible: false,
          }),
        ]}
        draftedIds={new Set(["b"])}
        draftedPriceByPlayerId={new Map([["b", 16]])}
        draftedByTeam={new Map([["b", "Team A"]])}
        onPlayerClick={noop}
        isInWatchlist={() => false}
        addToWatchlist={noop}
        removeFromWatchlist={noop}
      />,
    );

    expect(screen.getByText(/1 left/)).toBeTruthy();
    expect(screen.getByText(/1 drafted/)).toBeTruthy();
    expect(screen.queryByText(/No auction value/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /expand tier 1/i }));

    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Drafted from this tier")).toBeTruthy();
    expect(screen.getByText("Sold")).toBeTruthy();
    const draftResult = document.querySelector(".pt-research-draft-result");
    expect(draftResult?.textContent).toContain("Team A");
    expect(draftResult?.textContent).toContain("$16");
    expect(draftResult?.querySelector(".pt-research-draft-result__tag")).toBeNull();
    expect(screen.queryByText(/no valuation/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /queue/i })).toBeNull();
  });

  it("shows position mix badges in a dedicated column", () => {
    const { container } = render(
      <TiersView
        players={[
          ...Array.from({ length: 3 }, (_, i) =>
            player({
              id: `of${i}`,
              position: "OF",
              positions: ["OF"],
              auction_tier: 1,
              auction_value: 10,
            }),
          ),
          player({
            id: "p1",
            position: "P",
            positions: ["SP"],
            auction_tier: 1,
            auction_value: 12,
          }),
        ]}
        draftedIds={new Set()}
        onPlayerClick={noop}
        isInWatchlist={() => false}
        addToWatchlist={noop}
        removeFromWatchlist={noop}
      />,
    );

    const mixCol = container.querySelector(
      ".tier-group .tier-summary-columns__mix",
    );
    expect(mixCol).toBeTruthy();
    const grid = mixCol!.querySelector(".tier-group__mix-grid");
    expect(grid).toBeTruthy();
    expect(grid!.querySelectorAll(".tier-group__mix-slot").length).toBeGreaterThan(
      1,
    );
    expect(mixCol!.textContent).toMatch(/OF/);
    expect(mixCol!.textContent).toMatch(/3/);
    const slots = grid!.querySelectorAll(".tier-group__mix-slot");
    expect(slots.length).toBe(7);
    expect(
      Array.from(slots).some((el) => el.textContent?.includes("DH")),
    ).toBe(false);
  });

  it("de-emphasizes min-bid replacement tier", () => {
    const { container } = render(
      <TiersView
        players={[
          player({ id: "e1", auction_tier: 1, auction_value: 17 }),
          ...Array.from({ length: 6 }, (_, i) =>
            player({
              id: `r${i}`,
              auction_tier: 5,
              auction_value: 1,
            }),
          ),
        ]}
        draftedIds={new Set()}
        onPlayerClick={noop}
        isInWatchlist={() => false}
        addToWatchlist={noop}
        removeFromWatchlist={noop}
      />,
    );

    const muted = container.querySelector(".tier-group--muted");
    expect(muted).toBeTruthy();
    expect(
      within(muted as HTMLElement).getByText("Replacement pool"),
    ).toBeTruthy();
  });
});
