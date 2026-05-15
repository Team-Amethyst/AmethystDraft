import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import League, { DRAFTROOM_DEFAULT_ROSTER_SLOTS } from "./League";

describe("League rosterSlots Mongo default", () => {
  it("exports the Draftroom web/mobile standard shape", () => {
    expect(DRAFTROOM_DEFAULT_ROSTER_SLOTS).toEqual({
      C: 1,
      "1B": 1,
      "2B": 1,
      SS: 1,
      "3B": 1,
      MI: 1,
      CI: 1,
      OF: 3,
      UTIL: 1,
      SP: 5,
      RP: 2,
      BN: 3,
    });
    const sum = Object.values(DRAFTROOM_DEFAULT_ROSTER_SLOTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(21);
  });

  it("applies to a new League document when rosterSlots is omitted", () => {
    const doc = new League({
      name: "No Roster Payload League",
      commissionerId: new mongoose.Types.ObjectId(),
      memberIds: [],
      scoringCategories: [],
    });
    expect(doc.rosterSlots).toEqual(DRAFTROOM_DEFAULT_ROSTER_SLOTS);
    expect(typeof doc.seasonYear).toBe("number");
    expect(typeof doc.leagueFamilyId).toBe("string");
    expect(doc.leagueFamilyId.length).toBeGreaterThan(20);
  });
});
