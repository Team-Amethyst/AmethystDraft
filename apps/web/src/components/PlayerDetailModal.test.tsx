import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PlayerDetailModal from "./PlayerDetailModal";
import type { Player } from "../types/player";
import { buildPlayerDetailValuationLadder } from "../domain/playerDetailValuationLadder";

afterEach(() => {
  cleanup();
});

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "woo",
    mlbId: 1,
    name: "Bryan Woo",
    team: "SEA",
    position: "SP",
    age: 25,
    catalog_rank: 50,
    value: 10,
    catalog_tier: 3,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "",
    ...overrides,
  } as Player;
}

describe("PlayerDetailModal valuation strip", () => {
  it("shows Command Center ladder labels and Bid Edge (not Roster Edge)", () => {
    const player = makePlayer({
      auction_value: 22,
      team_value: 47,
      recommended_bid: 34,
      max_bid: 34,
      edge: 25,
    });
    const ladder = buildPlayerDetailValuationLadder(player);
    expect(ladder.bidEdge).toBe(13);

    render(
      <PlayerDetailModal
        isOpen
        player={player}
        onClose={() => {}}
        onMoveToCommandCenter={() => {}}
        researchEngineBoardPhase="ready"
        researchSurface
      />,
    );

    expect(screen.getByText("League FMV")).toBeTruthy();
    expect(screen.getByText("Recommended Bid")).toBeTruthy();
    expect(screen.getByText("Team Value")).toBeTruthy();
    expect(screen.getByText("Bid Edge")).toBeTruthy();
    expect(screen.queryByText("Roster Edge")).toBeNull();

    expect(screen.getByText("$22")).toBeTruthy();
    expect(screen.getByText("$34")).toBeTruthy();
    expect(screen.getByText("$47")).toBeTruthy();
    expect(screen.getByText("+$13")).toBeTruthy();
  });

  it("shows Max Bid in Why this value when it equals Recommended Bid", () => {
    const player = makePlayer({
      auction_value: 22,
      team_value: 47,
      recommended_bid: 34,
      max_bid: 34,
      baseline_value: 18,
      valuation_explain: {
        replacement_key_used: "SP",
      },
    });

    render(
      <PlayerDetailModal
        isOpen
        player={player}
        onClose={() => {}}
        onMoveToCommandCenter={() => {}}
        researchEngineBoardPhase="ready"
        researchSurface
      />,
    );

    expect(screen.queryByRole("listitem", { name: /Max Bid/i })).toBeNull();
    expect(screen.getByText(/Max Bid:/)).toBeTruthy();
    expect(screen.getByText(/hard stop/)).toBeTruthy();
    expect(screen.getByText(/same as Recommended Bid/)).toBeTruthy();
  });
});
