import { describe, expect, it } from "vitest";
import { PLAYER_TABLE_STORAGE_KEYS } from "./playerTableStorage";

describe("PLAYER_TABLE_STORAGE_KEYS", () => {
  it("uses stable amethyst-prefixed keys", () => {
    expect(PLAYER_TABLE_STORAGE_KEYS.sort).toBe("amethyst-pt-sort");
    expect(PLAYER_TABLE_STORAGE_KEYS.starred).toBe("amethyst-pt-starred");
  });
});
