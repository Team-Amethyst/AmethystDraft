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
    expect(
      screen.getByText(/Value bands from the current Engine auction board/i),
    ).toBeTruthy();
    expect(screen.getByText("Tier 2")).toBeTruthy();
    expect(screen.getByText(/Strong starters/i)).toBeTruthy();
    expect(screen.getByText("Tier 4")).toBeTruthy();
    expect(screen.getByText(/Depth values/i)).toBeTruthy();
    expect(screen.queryByText(/Leaders/i)).toBeNull();
  });

  it("shows value range, avg, and cliff in collapsed tier summary", () => {
    render(
      <TiersView
        players={[
          player({ id: "p1", auction_tier: 1, auction_value: 17.38 }),
          player({ id: "p2", auction_tier: 1, auction_value: 15.24 }),
          player({ id: "p3", auction_tier: 2, auction_value: 9 }),
        ]}
        draftedIds={new Set()}
        onPlayerClick={noop}
        isInWatchlist={() => false}
        addToWatchlist={noop}
        removeFromWatchlist={noop}
      />,
    );

    const rangeEl = document.querySelector(".tier-group__range");
    expect(rangeEl?.textContent).toMatch(/\$15–\$17/);
    expect(rangeEl?.getAttribute("title")).toMatch(
      /Displayed dollars are rounded\. Tiers and cliffs use raw auction values\./,
    );
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

    await user.click(screen.getByRole("button", { name: /expand tier 2/i }));

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

  it("shows depleted tier when 0 available", () => {
    render(
      <TiersView
        players={Array.from({ length: 3 }, (_, i) =>
          player({
            id: `d${i}`,
            auction_tier: 1,
            auction_value: 27 - i,
          }),
        )}
        draftedIds={new Set(["d0", "d1", "d2"])}
        onPlayerClick={noop}
        isInWatchlist={() => false}
        addToWatchlist={noop}
        removeFromWatchlist={noop}
      />,
    );

    expect(screen.getByText(/Depleted · 3 drafted/)).toBeTruthy();
    expect(screen.queryByText(/players ·/)).toBeNull();
    const depletedSection = document.querySelector(".tier-group--depleted");
    expect(depletedSection).toBeTruthy();
    expect(within(depletedSection as HTMLElement).getAllByText("—").length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("shows available count before drafted without total in primary line", () => {
    render(
      <TiersView
        players={[
          player({ id: "a", auction_tier: 2, auction_value: 18 }),
          player({ id: "b", auction_tier: 2, auction_value: 16 }),
          player({ id: "c", auction_tier: 2, auction_value: 15 }),
        ]}
        draftedIds={new Set(["c"])}
        onPlayerClick={noop}
        isInWatchlist={() => false}
        addToWatchlist={noop}
        removeFromWatchlist={noop}
      />,
    );

    expect(screen.getByText("2 left · 1 drafted")).toBeTruthy();
    expect(screen.queryByText(/3 players ·/)).toBeNull();
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

    expect(screen.getByText(/1 left · 1 drafted/)).toBeTruthy();
    expect(screen.queryByText(/No auction value/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /expand tier 2/i }));

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
              auction_value: 11,
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

  it("does not show Engine tier chip on expanded tier rows", async () => {
    const user = userEvent.setup();
    render(
      <TiersView
        players={[
          player({
            id: "mis",
            name: "Mismatch",
            auction_tier: 1,
            auction_value: 4,
          }),
        ]}
        draftedIds={new Set()}
        onPlayerClick={noop}
        isInWatchlist={() => false}
        addToWatchlist={noop}
        removeFromWatchlist={noop}
      />,
    );

    await user.click(screen.getByRole("button", { name: /expand tier 5/i }));
    expect(screen.getByText("Mismatch")).toBeTruthy();
    expect(screen.queryByText(/Engine T\d/)).toBeNull();
  });

  it("de-emphasizes min-bid replacement tier", () => {
    const { container } = render(
      <TiersView
        players={[
          player({ id: "e1", auction_tier: 1, auction_value: 27 }),
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
    expect(within(muted as HTMLElement).getByText("Min-bid / reserve")).toBeTruthy();
    expect(
      within(muted as HTMLElement).getByText("Replacement pool"),
    ).toBeTruthy();
  });
});
