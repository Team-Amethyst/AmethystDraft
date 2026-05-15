import { describe, it, expect } from "vitest";
import type { ILeague } from "../models/League";
import type { IRosterEntry } from "../models/RosterEntry";
import {
  computeDraftStatusForLeague,
  countFilledMainRosterSpots,
  hasNonKeeperMainDraftPick,
  requiredMainRosterSpots,
} from "./draftStatus";

function league(overrides: Partial<ILeague> = {}): Pick<
  ILeague,
  "draftStatus" | "rosterSlots" | "teams" | "teamNames" | "memberIds"
> {
  return {
    draftStatus: "pre-draft",
    rosterSlots: { C: 1, OF: 1 },
    teams: 2,
    teamNames: ["A", "B"],
    memberIds: [],
    ...overrides,
  };
}

function row(
  partial: Partial<IRosterEntry> & Pick<IRosterEntry, "rosterSlot">,
): Pick<IRosterEntry, "isKeeper" | "rosterSlot"> {
  return {
    isKeeper: false,
    ...partial,
  };
}

describe("computeDraftStatusForLeague", () => {
  const required = () => requiredMainRosterSpots(league());

  it("keeper import alone leaves pre-draft", () => {
    const entries = [
      row({ isKeeper: true, rosterSlot: "C" }),
      row({ isKeeper: true, rosterSlot: "OF" }),
    ];
    expect(hasNonKeeperMainDraftPick(entries)).toBe(false);
    expect(computeDraftStatusForLeague(league(), entries)).toBe("pre-draft");
    expect(required()).toBe(4);
  });

  it("first non-keeper main pick sets in-progress", () => {
    const entries = [
      row({ isKeeper: true, rosterSlot: "C" }),
      row({ isKeeper: false, rosterSlot: "OF", teamId: "team_1" }),
    ];
    expect(computeDraftStatusForLeague(league(), entries)).toBe("in-progress");
    expect(countFilledMainRosterSpots(entries)).toBe(2);
  });

  it("filling all required main slots sets completed", () => {
    const entries = [
      row({ isKeeper: true, rosterSlot: "C", teamId: "team_1" }),
      row({ isKeeper: true, rosterSlot: "C", teamId: "team_2" }),
      row({ isKeeper: false, rosterSlot: "OF", teamId: "team_1" }),
      row({ isKeeper: false, rosterSlot: "OF", teamId: "team_2" }),
    ];
    expect(computeDraftStatusForLeague(league(), entries)).toBe("completed");
  });

  it("completed does not regress after another write", () => {
    const entries = [
      row({ isKeeper: false, rosterSlot: "C", teamId: "team_1" }),
    ];
    expect(
      computeDraftStatusForLeague(
        league({ draftStatus: "completed" }),
        entries,
      ),
    ).toBe("completed");
  });

  it("deleting picks from completed stays completed", () => {
    expect(
      computeDraftStatusForLeague(league({ draftStatus: "completed" }), []),
    ).toBe("completed");
  });

  it("taxi rows do not count toward main draft completion", () => {
    const tiny = league({ rosterSlots: { C: 1 }, teams: 2, teamNames: ["A", "B"] });
    const onlyTaxiNonKeeper = [
      row({ isKeeper: false, rosterSlot: "TAXI" }),
      row({ isKeeper: true, rosterSlot: "C", teamId: "team_1" }),
    ];
    expect(requiredMainRosterSpots(tiny)).toBe(2);
    expect(countFilledMainRosterSpots(onlyTaxiNonKeeper)).toBe(1);
    expect(computeDraftStatusForLeague(tiny, onlyTaxiNonKeeper)).toBe("pre-draft");

    const oneMainAuctionPick = [
      row({ isKeeper: false, rosterSlot: "C", teamId: "team_1" }),
      row({ isKeeper: false, rosterSlot: "TAXI", teamId: "team_1" }),
    ];
    expect(computeDraftStatusForLeague(tiny, oneMainAuctionPick)).toBe("in-progress");

    const fullMain = [
      row({ isKeeper: false, rosterSlot: "C", teamId: "team_1" }),
      row({ isKeeper: false, rosterSlot: "C", teamId: "team_2" }),
      row({ isKeeper: false, rosterSlot: "TAXI", teamId: "team_1" }),
    ];
    expect(computeDraftStatusForLeague(tiny, fullMain)).toBe("completed");
  });

  it("minor rows do not count toward filled main spots", () => {
    const entries = [
      row({ isKeeper: false, rosterSlot: "MIN1" }),
      row({ isKeeper: true, rosterSlot: "C" }),
    ];
    expect(hasNonKeeperMainDraftPick(entries)).toBe(false);
    expect(computeDraftStatusForLeague(league(), entries)).toBe("pre-draft");
  });

  it("excludes taxi position keys from required capacity", () => {
    const withTaxiSlot = league({
      rosterSlots: { C: 1, TAXI: 2 },
      teams: 2,
      teamNames: ["A", "B"],
    });
    expect(requiredMainRosterSpots(withTaxiSlot)).toBe(2);
  });
});
