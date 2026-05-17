import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Player } from "../../types/player";
import { ResearchPlayerTableRow } from "./ResearchPlayerTableRow";

function player(partial: Partial<Player> & { id: string }): Player {
  return {
    id: partial.id,
    mlbId: 1,
    name: partial.name ?? partial.id,
    team: partial.team ?? "SEA",
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

afterEach(() => cleanup());

describe("ResearchPlayerTableRow", () => {
  it("renders research player cell with headshot, name, pos badges, and team", () => {
    render(
      <table>
        <tbody>
          <ResearchPlayerTableRow
            player={player({
              id: "p1",
              name: "Julio Rodríguez",
              team: "SEA",
              position: "OF",
              auction_value: 17,
              auction_rank: 1,
            })}
          />
        </tbody>
      </table>,
    );

    expect(screen.getByText("Julio Rodríguez")).toBeTruthy();
    expect(screen.getByText("SEA")).toBeTruthy();
    expect(document.querySelector(".player-cell--research")).toBeTruthy();
    expect(document.querySelector(".player-headshot, .headshot-fallback")).toBeTruthy();
    expect(document.querySelector(".td-pos .pos-badge, .pt-pos-badges")).toBeTruthy();
  });
});
