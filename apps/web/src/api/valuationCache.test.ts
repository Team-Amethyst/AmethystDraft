import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ValuationResponse } from "./engine";
import {
  __resetValuationCachesForTests,
  buildValuationBoardCacheKey,
  fetchBoardValuationWithCache,
  fetchPlayerValuationWithCache,
  invalidateValuationCachesForLeague,
  peekBoardValuationCache,
  type ValuationBoardCacheContext,
} from "./valuationCache";
import { __setValuationExecutorsForTests } from "./engineValuationInternal";

function minimalBoardResponse(): ValuationResponse {
  return {
    inflation_factor: 1,
    total_budget_remaining: 100,
    pool_value_remaining: 100,
    players_remaining: 10,
    valuations: [],
    calculated_at: new Date().toISOString(),
  };
}

describe("valuationCache", () => {
  beforeEach(() => {
    __resetValuationCachesForTests();
    vi.restoreAllMocks();
  });

  it("dedupes concurrent board fetches with identical cache key (shared promise)", async () => {
    let release!: () => void;
    const barrier = new Promise<void>((r) => {
      release = () => r();
    });
    const boardSpy = vi.fn(async (): Promise<ValuationResponse> => {
      await barrier;
      return minimalBoardResponse();
    });
    __setValuationExecutorsForTests({ board: boardSpy });

    const ctx: ValuationBoardCacheContext = {
      leagueConfigKey: '{"id":"L1"}',
      rosterFingerprint: "a|b",
    };
    const p1 = fetchBoardValuationWithCache({
      leagueId: "L1",
      token: "t",
      userTeamId: "team_1",
      cacheContext: ctx,
    });
    const p2 = fetchBoardValuationWithCache({
      leagueId: "L1",
      token: "t",
      userTeamId: "team_1",
      cacheContext: ctx,
    });
    expect(boardSpy).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([p1, p2]);
    expect(boardSpy).toHaveBeenCalledTimes(1);
  });

  it("second Research/My Draft–style board request with same state returns cached result without HTTP", async () => {
    let calls = 0;
    __setValuationExecutorsForTests({
      board: vi.fn(async () => {
        calls++;
        return minimalBoardResponse();
      }),
    });
    const ctx: ValuationBoardCacheContext = {
      leagueConfigKey: "cfg",
      rosterFingerprint: "rost",
    };
    await fetchBoardValuationWithCache({
      leagueId: "L",
      token: "tok",
      userTeamId: "team_1",
      cacheContext: ctx,
    });
    await fetchBoardValuationWithCache({
      leagueId: "L",
      token: "tok",
      userTeamId: "team_1",
      cacheContext: ctx,
    });
    expect(calls).toBe(1);
  });

  it("uses a different cache key when user_team_id changes", async () => {
    const boardSpy = vi.fn(async () => minimalBoardResponse());
    __setValuationExecutorsForTests({ board: boardSpy });
    const ctx: ValuationBoardCacheContext = {
      leagueConfigKey: "cfg",
      rosterFingerprint: "rost",
    };
    await fetchBoardValuationWithCache({
      leagueId: "L",
      token: "tok",
      userTeamId: "team_1",
      cacheContext: ctx,
    });
    await fetchBoardValuationWithCache({
      leagueId: "L",
      token: "tok",
      userTeamId: "team_2",
      cacheContext: ctx,
    });
    expect(boardSpy).toHaveBeenCalledTimes(2);
  });

  it("invalidates board cache for a league (simulates explicit invalidate after bid/draft)", async () => {
    let calls = 0;
    __setValuationExecutorsForTests({
      board: vi.fn(async () => {
        calls++;
        return minimalBoardResponse();
      }),
    });
    const ctx: ValuationBoardCacheContext = {
      leagueConfigKey: "cfg",
      rosterFingerprint: "pick:1",
    };
    await fetchBoardValuationWithCache({
      leagueId: "L9",
      token: "tok",
      userTeamId: "team_1",
      cacheContext: ctx,
    });
    invalidateValuationCachesForLeague("L9", "test_invalidation");
    await fetchBoardValuationWithCache({
      leagueId: "L9",
      token: "tok",
      userTeamId: "team_1",
      cacheContext: ctx,
    });
    expect(calls).toBe(2);
  });

  it("does not evict board cache when caching explain player responses", async () => {
    let boardCalls = 0;
    const playerSpy = vi.fn(async () => ({
      ...minimalBoardResponse(),
      valuations: [],
    }));
    __setValuationExecutorsForTests({
      board: vi.fn(async () => {
        boardCalls++;
        return minimalBoardResponse();
      }),
      player: playerSpy,
    });
    const ctx: ValuationBoardCacheContext = {
      leagueConfigKey: "cfg",
      rosterFingerprint: "rost",
    };
    await fetchBoardValuationWithCache({
      leagueId: "L",
      token: "tok",
      userTeamId: "team_1",
      cacheContext: ctx,
    });
    await fetchPlayerValuationWithCache({
      leagueId: "L",
      token: "tok",
      playerId: "99",
      userTeamId: "team_1",
      options: { explainValuationRows: true },
      cacheContext: ctx,
    });
    await fetchBoardValuationWithCache({
      leagueId: "L",
      token: "tok",
      userTeamId: "team_1",
      cacheContext: ctx,
    });
    expect(boardCalls).toBe(1);
    expect(playerSpy).toHaveBeenCalledTimes(1);
  });

  it("uses a fresh board fetch when cache extras change (Research custom ids)", async () => {
    let calls = 0;
    __setValuationExecutorsForTests({
      board: vi.fn(async () => {
        calls++;
        return minimalBoardResponse();
      }),
    });
    const base = {
      leagueConfigKey: "cfg",
      rosterFingerprint: "rost",
      extras: "custom:a,b",
    };
    await fetchBoardValuationWithCache({
      leagueId: "L",
      token: "tok",
      userTeamId: "team_1",
      cacheContext: base,
    });
    await fetchBoardValuationWithCache({
      leagueId: "L",
      token: "tok",
      userTeamId: "team_1",
      cacheContext: { ...base, extras: "custom:a,b,c" },
    });
    expect(calls).toBe(2);
  });

  it("dedupes concurrent player explain fetches with identical cache key (shared promise)", async () => {
    let release!: () => void;
    const barrier = new Promise<void>((r) => {
      release = () => r();
    });
    const playerSpy = vi.fn(async () => {
      await barrier;
      return {
        ...minimalBoardResponse(),
        valuations: [],
      };
    });
    __setValuationExecutorsForTests({ player: playerSpy });
    const ctx: ValuationBoardCacheContext = {
      leagueConfigKey: "cfg",
      rosterFingerprint: "rost",
    };
    const p1 = fetchPlayerValuationWithCache({
      leagueId: "L",
      token: "tok",
      playerId: "42",
      userTeamId: "team_1",
      options: { explainValuationRows: true },
      cacheContext: ctx,
    });
    const p2 = fetchPlayerValuationWithCache({
      leagueId: "L",
      token: "tok",
      playerId: "42",
      userTeamId: "team_1",
      options: { explainValuationRows: true },
      cacheContext: ctx,
    });
    expect(playerSpy).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([p1, p2]);
    expect(playerSpy).toHaveBeenCalledTimes(1);
  });

  it("uses a fresh board fetch when rosterFingerprint changes (draft state)", async () => {
    let calls = 0;
    __setValuationExecutorsForTests({
      board: vi.fn(async () => {
        calls++;
        return minimalBoardResponse();
      }),
    });
    const base = { leagueConfigKey: "cfg", rosterFingerprint: "before" };
    await fetchBoardValuationWithCache({
      leagueId: "L",
      token: "tok",
      userTeamId: "team_1",
      cacheContext: base,
    });
    await fetchBoardValuationWithCache({
      leagueId: "L",
      token: "tok",
      userTeamId: "team_1",
      cacheContext: { ...base, rosterFingerprint: "after_pick" },
    });
    expect(calls).toBe(2);
  });

  it("buildValuationBoardCacheKey includes league and team in stable order", () => {
    const k = buildValuationBoardCacheKey("L1", "team_1", {
      leagueConfigKey: '{"x":1}',
      rosterFingerprint: "r1",
      extras: "custom:a",
    });
    expect(
      k.startsWith(
        `L1\u001fteam_1\u001fstage3b-demo-only-v1\u001freplacement_slots_v2\u001f`,
      ),
    ).toBe(true);
    expect(k.endsWith(`\u001fcustom:a\u001f`)).toBe(true);
  });

  it("peekBoardValuationCache returns stored board for active key", async () => {
    __setValuationExecutorsForTests({
      board: vi.fn(async () => ({
        ...minimalBoardResponse(),
        valuations: [{ player_id: "1" } as never],
      })),
    });
    const ctx: ValuationBoardCacheContext = {
      leagueConfigKey: "cfg",
      rosterFingerprint: "rost",
    };
    await fetchBoardValuationWithCache({
      leagueId: "L",
      token: "tok",
      userTeamId: "team_1",
      cacheContext: ctx,
    });
    const peek = peekBoardValuationCache("L", "team_1", ctx);
    expect(peek?.valuations?.[0]?.player_id).toBe("1");
  });
});
