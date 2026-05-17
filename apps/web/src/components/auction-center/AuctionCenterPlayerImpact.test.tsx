import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Player } from "../../types/player";
import type { AuctionCenterCategoryImpactRow } from "../../pages/command-center-utils/categoryImpactRows";
import { AuctionCenterPlayerImpact } from "./AuctionCenterPlayerImpact";

const basePlayer: Player = {
  id: "p1",
  mlbId: 1,
  name: "Ace",
  team: "TST",
  position: "SP",
  age: 28,
  catalog_rank: 10,
  value: 40,
  catalog_tier: 1,
  headshot: "",
  stats: {
    pitching: {
      era: "2.59",
      whip: "0.98",
      wins: "12",
      saves: "0",
      holds: "0",
      strikeouts: "255",
      innings: "180",
      completeGames: "1",
    },
  },
  projection: {
    pitching: {
      era: "2.59",
      whip: "0.98",
      wins: 12,
      saves: 0,
      holds: 0,
      strikeouts: 255,
      completeGames: 1,
      innings: 180,
    },
  },
  outlook: "",
};

const strikeoutsImpact: AuctionCenterCategoryImpactRow = {
  name: "Strikeouts (K)",
  teamPaceStr: "97",
  withPlayerStr: "352",
  playerContributionStr: "+255",
  teamMovementLine: "97 → 352",
  categoryEffectLabel: "Improves",
  rotoPtsLine: "+5 roto pts",
  deltaStr: "+255",
  improved: true,
  neutral: false,
};

const eraImpact: AuctionCenterCategoryImpactRow = {
  name: "ERA",
  teamPaceStr: "2.67",
  withPlayerStr: "2.62",
  playerContributionStr: null,
  teamMovementLine: "2.67 → 2.62",
  categoryEffectLabel: "Worsens",
  rotoPtsLine: "−2 roto pts",
  deltaStr: "Worsens",
  improved: false,
  neutral: false,
};

const savesImpact: AuctionCenterCategoryImpactRow = {
  name: "Saves (SV)",
  teamPaceStr: "0",
  withPlayerStr: "0",
  playerContributionStr: null,
  teamMovementLine: "0 → 0",
  categoryEffectLabel: "No projected change",
  rotoPtsLine: "+0 roto pts",
  deltaStr: "No projected change",
  improved: false,
  neutral: true,
};

describe("AuctionCenterPlayerImpact", () => {
  it("renders pitching cards with stat, team move, and roto delta only", () => {
    render(
      <AuctionCenterPlayerImpact
        selectedPlayer={basePlayer}
        statView="pitching"
        onStatViewChange={vi.fn()}
        catImpactRows={[strikeoutsImpact, eraImpact, savesImpact]}
        pitchingCats={[
          { name: "Strikeouts (K)", type: "pitching" },
          { name: "ERA", type: "pitching" },
          { name: "Saves (SV)", type: "pitching" },
        ]}
        hittingCats={[]}
      />,
    );
    expect(screen.getByText("Strikeouts (K)")).toBeTruthy();
    expect(screen.getByText("255")).toBeTruthy();
    expect(screen.getByText("97 → 352")).toBeTruthy();
    expect(screen.getByText("+5 pts")).toBeTruthy();
    expect(screen.getByText("-2 pts")).toBeTruthy();
    expect(screen.getByText("0 pts")).toBeTruthy();
    expect(screen.queryByText("Improves")).toBeNull();
    expect(screen.queryByText("Worsens")).toBeNull();
    expect(screen.queryByText("No projected change")).toBeNull();
    expect(screen.queryByText(/Roto impact:/i)).toBeNull();
  });

  it("switches to hitting via toggle", async () => {
    const user = userEvent.setup();
    const onStatViewChange = vi.fn();
    render(
      <AuctionCenterPlayerImpact
        selectedPlayer={basePlayer}
        statView="pitching"
        onStatViewChange={onStatViewChange}
        catImpactRows={[]}
        pitchingCats={[{ name: "ERA", type: "pitching" }]}
        hittingCats={[{ name: "Home Runs (HR)", type: "batting" }]}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Hitting" }));
    expect(onStatViewChange).toHaveBeenCalledWith("hitting");
  });

  it("renders hitting grid when hitting is active", () => {
    render(
      <AuctionCenterPlayerImpact
        selectedPlayer={{
          ...basePlayer,
          stats: {
            batting: {
              avg: ".280",
              hr: 35,
              rbi: 100,
              runs: 90,
              sb: 8,
              obp: ".350",
              slg: ".520",
            },
          },
        }}
        statView="hitting"
        onStatViewChange={vi.fn()}
        catImpactRows={[
          {
            ...strikeoutsImpact,
            name: "Home Runs (HR)",
            teamMovementLine: "120 → 155",
            categoryEffectLabel: "Improves",
          },
        ]}
        pitchingCats={[]}
        hittingCats={[{ name: "Home Runs (HR)", type: "batting" }]}
      />,
    );
    expect(screen.getByText("Home Runs (HR)")).toBeTruthy();
    expect(screen.getByText("120 → 155")).toBeTruthy();
  });
});

afterEach(() => {
  cleanup();
});
