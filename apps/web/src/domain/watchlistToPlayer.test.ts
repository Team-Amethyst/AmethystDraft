import { describe, expect, it } from "vitest";
import { playerFromWatchlistEntry } from "./watchlistToPlayer";
import type { WatchlistPlayer } from "../api/watchlist";

describe("playerFromWatchlistEntry", () => {
  it("maps core fields and stubs catalog-only data", () => {
    const w: WatchlistPlayer = {
      id: "x1",
      name: "Test Player",
      team: "TST",
      position: "OF",
      positions: ["OF"],
      adp: 12,
      value: 5,
      tier: 2,
      recommended_bid: 10,
    };
    const pl = playerFromWatchlistEntry(w);
    expect(pl.id).toBe("x1");
    expect(pl.mlbId).toBe(0);
    expect(pl.recommended_bid).toBe(10);
    expect(pl.headshot).toBe("");
    expect(pl.stats).toEqual({});
  });
});
