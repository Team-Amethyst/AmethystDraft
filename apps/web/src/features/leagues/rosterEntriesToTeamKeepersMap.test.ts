import { describe, it, expect } from "vitest";
import type { RosterEntry } from "../../api/roster";
import {
  isPreloadableAsKeeper,
  rosterEntriesToTeamKeepersMap,
} from "./rosterEntriesToTeamKeepersMap";

function entry(
  partial: Partial<RosterEntry> & Pick<RosterEntry, "rosterSlot">,
): RosterEntry {
  return {
    _id: "e1",
    externalPlayerId: "p1",
    playerName: "Player One",
    playerTeam: "NYY",
    price: 12,
    teamId: "team_1",
    isKeeper: false,
    positions: ["OF"],
    ...partial,
  } as RosterEntry;
}

describe("rosterEntriesToTeamKeepersMap", () => {
  it("isPreloadableAsKeeper includes keepers and drafted auction rows", () => {
    expect(isPreloadableAsKeeper(entry({ isKeeper: true, rosterSlot: "OF" }))).toBe(
      true,
    );
    expect(
      isPreloadableAsKeeper(entry({ isKeeper: false, rosterSlot: "SP" })),
    ).toBe(true);
    expect(
      isPreloadableAsKeeper(entry({ isKeeper: false, rosterSlot: "MIN" })),
    ).toBe(false);
    expect(
      isPreloadableAsKeeper(entry({ isKeeper: false, rosterSlot: "TAXI" })),
    ).toBe(false);
  });

  it("includeDraftedPlayers maps keepers and non-keeper draft picks", () => {
    const rows = rosterEntriesToTeamKeepersMap(
      [
        entry({ isKeeper: true, rosterSlot: "C", playerName: "Keeper" }),
        entry({ isKeeper: false, rosterSlot: "OF", playerName: "Drafted" }),
        entry({ isKeeper: false, rosterSlot: "MIN", playerName: "Minor" }),
      ],
      ["Alpha"],
      { includeDraftedPlayers: true },
    );
    expect(rows.Alpha?.map((k) => k.playerName)).toEqual(["Keeper", "Drafted"]);
  });

  it("default mode maps only isKeeper rows", () => {
    const rows = rosterEntriesToTeamKeepersMap(
      [
        entry({ isKeeper: true, playerName: "Keeper" }),
        entry({ isKeeper: false, playerName: "Drafted" }),
      ],
      ["Alpha"],
    );
    expect(rows.Alpha?.map((k) => k.playerName)).toEqual(["Keeper"]);
  });
});
