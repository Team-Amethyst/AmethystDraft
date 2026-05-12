import { describe, expect, it } from "vitest";
import { playerTableRowsMatchingTagFilter } from "./playerTableTagFilter";

describe("playerTableRowsMatchingTagFilter", () => {
  it("returns all rows when no tags selected", () => {
    const rows = [{ tags: ["HR+"] }, { tags: ["SB+"] }];
    expect(playerTableRowsMatchingTagFilter(rows, new Set())).toEqual(rows);
  });

  it("requires every selected tag", () => {
    const rows = [
      { tags: ["HR+", "SB+"] },
      { tags: ["HR+"] },
    ];
    const out = playerTableRowsMatchingTagFilter(rows, new Set(["HR+", "SB+"]));
    expect(out).toEqual([{ tags: ["HR+", "SB+"] }]);
  });
});
