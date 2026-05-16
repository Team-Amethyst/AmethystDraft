import { describe, it, expect } from "vitest";
import {
  inferredPositionsFromRosterSlot,
  inferMongoPositionsFromCheckpointPick,
  normalizeCheckpointRosterSlotLabel,
} from "./inferredCheckpointPositions";

describe("normalizeCheckpointRosterSlotLabel", () => {
  it("maps workbook-only labels to canonical slots", () => {
    expect(normalizeCheckpointRosterSlotLabel("U")).toBe("UTIL");
    expect(normalizeCheckpointRosterSlotLabel("DH")).toBe("UTIL");
    expect(normalizeCheckpointRosterSlotLabel("SP")).toBe("SP");
  });
});

describe("inferredPositionsFromRosterSlot", () => {
  it("reflects hitter / pitcher shorthand", () => {
    expect(inferredPositionsFromRosterSlot("UTIL")).toEqual(["UTIL"]);
    expect(inferredPositionsFromRosterSlot("LF")).toEqual(["LF", "OF"]);
    expect(inferredPositionsFromRosterSlot("P")).toEqual(["SP"]);
  });
});

describe("inferMongoPositionsFromCheckpointPick", () => {
  it("trusts populated fixture positions arrays", () => {
    expect(
      inferMongoPositionsFromCheckpointPick({
        positions: ["LF", "OF"],
        roster_slot: "UTIL",
      }),
    ).toEqual(["LF", "OF"]);
  });

  it("falls back via roster_slot when positions missing", () => {
    expect(
      inferMongoPositionsFromCheckpointPick({
        positions: [],
        roster_slot: "3B",
      }),
    ).toEqual(["3B"]);

    expect(
      inferMongoPositionsFromCheckpointPick({
        roster_slot: "RP",
      }),
    ).toEqual(["RP"]);
  });
});
