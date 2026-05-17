import { describe, it, expect } from "vitest";
import { partitionCheckpointOverrides } from "./partitionCheckpointOverrides.mjs";
import { mergeFortyManWithExtras } from "./checkpointMlbResolver.mjs";

describe("partitionCheckpointOverrides", () => {
  it("splits keeper keys from draft_picks and extra_roster_entries", () => {
    const raw = {
      "A. Keeper": { player_id: "1", reason: "x" },
      draft_picks: { "10": { player_id: "2" } },
      extra_roster_entries: [{ player_id: "3", name: "X", abbr: "NYM" }],
    };
    const { keeperMap, draftPicksByPick, extraRosterEntries } =
      partitionCheckpointOverrides(raw);
    expect(keeperMap).toEqual({ "A. Keeper": { player_id: "1", reason: "x" } });
    expect(draftPicksByPick["10"]?.player_id).toBe("2");
    expect(extraRosterEntries).toHaveLength(1);
  });

  it("returns empty maps for non-object input", () => {
    const r = partitionCheckpointOverrides(null);
    expect(r.keeperMap).toEqual({});
    expect(r.draftPicksByPick).toEqual({});
    expect(r.extraRosterEntries).toEqual([]);
  });
});

describe("mergeFortyManWithExtras", () => {
  it("appends synthetic rows without clobbering existing ids", () => {
    const base = [
      {
        player_id: "1",
        name: "A",
        abbr: "NYM",
        raw_position: "P",
        fantasy_pitch: "SP",
      },
    ];
    const merged = mergeFortyManWithExtras(base, [
      { player_id: "2", name: "B", abbr: "NYM", raw_position: "P", fantasy_pitch: "RP" },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find((e) => e.player_id === "2")?.name).toBe("B");
  });
});
