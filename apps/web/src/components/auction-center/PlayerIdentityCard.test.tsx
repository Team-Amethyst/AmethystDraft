import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Player } from "../../types/player";
import { PlayerIdentityCard } from "./PlayerIdentityCard";

const pitcher: Player = {
  id: "p1",
  mlbId: 1,
  name: "Max Fried",
  team: "NYY",
  position: "SP",
  age: 30,
  catalog_rank: 12,
  value: 40,
  catalog_tier: 1,
  auction_rank: 45,
  headshot: "",
  injuryStatus: "IL15",
  stats: {},
  projection: {},
  outlook: "",
};

const reliever: Player = {
  ...pitcher,
  id: "p2",
  name: "Robert Suarez",
  team: "SD",
  position: "RP",
  injuryStatus: undefined,
  catalog_rank: 203,
  auction_rank: 88,
};

const hitter: Player = {
  id: "h1",
  mlbId: 3,
  name: "Freddy Fermin",
  team: "KC",
  position: "C",
  age: 26,
  catalog_rank: 420,
  value: 8,
  catalog_tier: 1,
  auction_rank: 310,
  headshot: "",
  injuryStatus: undefined,
  stats: {},
  projection: {},
  outlook: "",
};

const defaultProps = {
  selectedPlayer: pitcher,
  draftPrimaryTags: ["P"],
  draftableSlots: ["SP", "RP", "BN"],
  tierValue: 1,
  marketAdp: 54.91,
  auctionRank: 45,
  modelRank: 12,
  isInWatchlist: () => false,
  playerNote: "",
  setPlayerNote: vi.fn(),
};

describe("PlayerIdentityCard", () => {
  it("renders name, injury beside name, and position in the name row", () => {
    render(<PlayerIdentityCard {...defaultProps} />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("Max Fried");
    expect(within(heading).getByText("IL15")).toBeTruthy();
    const posGroup = document.querySelector(".pic-name-pos-group");
    expect(posGroup).toBeTruthy();
    expect(within(posGroup!).getByText("P")).toBeTruthy();
    expect(within(posGroup!).queryByText("IL15")).toBeNull();
  });

  it("renders team beside name and unified rank row", () => {
    render(<PlayerIdentityCard {...defaultProps} />);
    const nameRow = document.querySelector(".pic-name-row");
    expect(nameRow).toBeTruthy();
    expect(within(nameRow!).getByText("NYY")).toBeTruthy();
    const injury = document.querySelector(".pic-name-injury-icon");
    expect(injury).toBeTruthy();
    const ranks = document.querySelector(".pic-ranks-row");
    expect(ranks).toBeTruthy();
    expect(within(ranks!).getByText(/Market ADP/)).toBeTruthy();
    expect(within(ranks!).getByText(/54\.91/)).toBeTruthy();
    expect(within(ranks!).getByText(/Auction 45/)).toBeTruthy();
    expect(within(ranks!).getByText(/Model 12/)).toBeTruthy();
    expect(within(ranks!).getByText("T1")).toBeTruthy();
    expect(ranks!.querySelectorAll(".pic-meta-stat").length).toBeGreaterThanOrEqual(
      3,
    );
    expect(screen.queryByText(/strong value/i)).toBeNull();
    expect(screen.queryByText("Tags:")).toBeNull();
  });

  it("renders slots row without tags", () => {
    render(<PlayerIdentityCard {...defaultProps} />);
    const slotsRow = screen.getByText("Slots:").closest(".pic-slots-row");
    expect(slotsRow).toBeTruthy();
    expect(within(slotsRow!).getByText("SP")).toBeTruthy();
    expect(within(slotsRow!).queryByText("T1")).toBeNull();
  });

  it("omits auction rank when missing", () => {
    render(
      <PlayerIdentityCard
        {...defaultProps}
        selectedPlayer={reliever}
        auctionRank={null}
        marketAdp={203.36}
        modelRank={203}
        tierValue={1}
      />,
    );
    const ranks = document.querySelector(".pic-ranks-row");
    expect(within(ranks!).queryByText(/Auction/)).toBeNull();
    expect(within(ranks!).getByText(/Model 203/)).toBeTruthy();
    expect(within(ranks!).getByText("T1")).toBeTruthy();
    expect(document.querySelector(".pic-name-team")?.textContent).toBe("SD");
    expect(screen.queryByText("Tags:")).toBeNull();
  });

  it("renders player notes textarea", () => {
    render(<PlayerIdentityCard {...defaultProps} playerNote="Lefty fade" />);
    const notes = screen.getByLabelText(/player notes/i);
    expect((notes as HTMLTextAreaElement).value).toBe("Lefty fade");
  });

  it("renders healthy reliever without injury badge", () => {
    render(
      <PlayerIdentityCard
        {...defaultProps}
        selectedPlayer={reliever}
        marketAdp={203.36}
        auctionRank={88}
        modelRank={203}
      />,
    );
    expect(screen.queryByText(/^IL/)).toBeNull();
    expect(screen.getByText(/Auction 88/)).toBeTruthy();
  });

  it("renders hitter metadata and slots", () => {
    render(
      <PlayerIdentityCard
        {...defaultProps}
        selectedPlayer={hitter}
        draftPrimaryTags={["C"]}
        draftableSlots={["C", "UTIL", "BN"]}
        marketAdp={420.5}
        auctionRank={310}
        modelRank={420}
      />,
    );
    expect(screen.getByText(/Model 420/)).toBeTruthy();
    expect(screen.getByText("UTIL")).toBeTruthy();
  });
});

afterEach(() => {
  cleanup();
});
