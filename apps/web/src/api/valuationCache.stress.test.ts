import { describe, expect, it, beforeEach } from "vitest";
import type { ValuationResponse, ValuationResult } from "./engine";
import {
  __resetValuationCachesForTests,
  buildValuationBoardCacheKey,
  fetchBoardValuationWithCache,
  invalidateValuationCachesForLeague,
  peekBoardValuationCache,
  type ValuationBoardCacheContext,
} from "./valuationCache";
import { __setValuationExecutorsForTests } from "./engineValuationInternal";
import {
  classifyBoardValuationFetchPhase,
  shouldMaskResearchEngineColumns,
} from "../domain/boardValuationFetchPhase";
import {
  leagueValuationConfigKey,
  openingBoardCalibrationCacheProfile,
  rosterValuationFingerprint,
} from "../utils/valuationDeps";
import type { League } from "../contexts/LeagueContext";

const ORIGINAL_ID = "69eeeedfacc8a071bb2ddcf8";
const DEMO_ID = "6a088b6731b28f142d5f44e9";
const FRIENDLY_ID = "69adf94bf906d9524b83f2df";
const TEAM = "team_1";
const TOKEN = "stress-token";

function leagueStub(id: string, name: string): League {
  return {
    id,
    name,
    teams: 12,
    budget: 260,
    rosterSlots: {},
    scoringCategories: [],
    memberIds: ["u1"],
    posEligibilityThreshold: 20,
    playerPool: "mixed",
    teamNames: Array.from({ length: 12 }, (_, i) => `T${i + 1}`),
  } as League;
}

function cacheCtx(league: League, rosterFingerprint = ""): ValuationBoardCacheContext {
  return {
    leagueConfigKey: leagueValuationConfigKey(league),
    rosterFingerprint,
  };
}

function boardWithTop(topAuction: number, playerId = "skubal"): ValuationResponse {
  const row: ValuationResult = {
    player_id: playerId,
    baseline_value: topAuction,
    auction_value: topAuction,
    recommended_bid: topAuction,
    auction_tier: 1,
    tier: 1,
    indicator: "neutral",
    auction_rank: 1,
    adp: 1,
    team_value: null,
    edge: null,
  };
  return {
    inflation_factor: 1,
    total_budget_remaining: 100,
    pool_value_remaining: 100,
    players_remaining: 100,
    valuations: [row],
    calculated_at: new Date().toISOString(),
  };
}

function topAuctionFromPeek(
  leagueId: string,
  ctx: ValuationBoardCacheContext,
): number | null {
  const peek = peekBoardValuationCache(leagueId, TEAM, ctx);
  const top = peek?.valuations?.[0]?.auction_value;
  return typeof top === "number" ? top : null;
}

function tierCounts(res: ValuationResponse | undefined): { t1: number; t2: number; t3: number } {
  const vals = res?.valuations ?? [];
  return {
    t1: vals.filter((v) => (v.auction_tier ?? v.tier) === 1).length,
    t2: vals.filter((v) => (v.auction_tier ?? v.tier) === 2).length,
    t3: vals.filter((v) => (v.auction_tier ?? v.tier) === 3).length,
  };
}

type StepLog = {
  step: string;
  cacheKey: string;
  openingProfile: string;
  peekTop: number | null;
  phase: ReturnType<typeof classifyBoardValuationFetchPhase>;
  masked: boolean;
};

describe("valuation cache stale-state stress (league switch / pick / refresh)", () => {
  beforeEach(() => {
    __resetValuationCachesForTests();
  });

  it("isolates Original demo, Demo keeper, Friendly empty, pick, and hard refresh", async () => {
    const original = leagueStub(ORIGINAL_ID, "Original");
    const demo = leagueStub(DEMO_ID, "[Demo] pre draft");
    const friendly = leagueStub(FRIENDLY_ID, "Friendly empty");

    const boards: Record<string, ValuationResponse> = {
      [ORIGINAL_ID]: boardWithTop(32),
      [DEMO_ID]: boardWithTop(27),
      [FRIENDLY_ID]: boardWithTop(17),
    };

    const installBoardMocks = () => {
      __setValuationExecutorsForTests({
        board: async (leagueId: string) => {
          const res = boards[leagueId];
          if (!res) throw new Error(`unexpected league ${leagueId}`);
          return res;
        },
      });
    };
    installBoardMocks();

    const log: StepLog[] = [];
    let lastSuccessKey: string | null = null;
    let displayedPresent = false;

    const runStep = async (
      step: string,
      league: League,
      rosterFp: string,
      opts?: { clearDisplay?: boolean; hardRefresh?: boolean },
    ) => {
      if (opts?.hardRefresh) {
        __resetValuationCachesForTests();
        installBoardMocks();
        lastSuccessKey = null;
      }
      if (opts?.clearDisplay) {
        displayedPresent = false;
        lastSuccessKey = null;
      }

      const ctx = cacheCtx(league, rosterFp);
      const key = buildValuationBoardCacheKey(league.id, TEAM, ctx);
      const peek = peekBoardValuationCache(league.id, TEAM, ctx);
      const phase = classifyBoardValuationFetchPhase({
        canStartFetch: true,
        peekHit: peek !== undefined,
        activeCacheKey: key,
        lastSuccessCacheKey: lastSuccessKey,
        displayedBoardPresent: displayedPresent,
      });
      const masked = shouldMaskResearchEngineColumns(phase, {
        valuation_eligible: true,
        catalog_kind: "valuation_eligible",
      });

      log.push({
        step,
        cacheKey: key,
        openingProfile: openingBoardCalibrationCacheProfile(league),
        peekTop: topAuctionFromPeek(league.id, ctx),
        phase,
        masked,
      });

      if (displayedPresent && phase === "refreshing") {
        expect(masked).toBe(true);
      }

      const res = await fetchBoardValuationWithCache({
        leagueId: league.id,
        token: TOKEN,
        userTeamId: TEAM,
        cacheContext: ctx,
      });
      lastSuccessKey = key;
      displayedPresent = true;
      return res;
    };

    // 1. Open Original
    const originalRes = await runStep("1_original_open", original, "");
    expect(originalRes.valuations[0]?.auction_value).toBe(32);
    const keyOriginalEmpty = log[0]!.cacheKey;

    // 2. Switch Demo — simulate Research league switch (clear display)
    const demoRes = await runStep("3_demo_predraft", demo, "", { clearDisplay: true });
    expect(demoRes.valuations[0]?.auction_value).toBe(27);
    expect(log[1]!.peekTop).toBeNull();
    expect(log[1]!.cacheKey).not.toBe(keyOriginalEmpty);
    expect(log[1]!.openingProfile).toBe("fresh_board_linear");

    // 3. Friendly empty — no demo calibration in key or values
    const friendlyRes = await runStep("5_friendly_empty", friendly, "", { clearDisplay: true });
    expect(friendlyRes.valuations[0]?.auction_value).toBe(17);
    expect(log[2]!.openingProfile).toBe("fresh_board_linear");
    expect(peekBoardValuationCache(DEMO_ID, TEAM, cacheCtx(demo))?.valuations[0]?.auction_value).toBe(
      27,
    );
    expect(
      peekBoardValuationCache(FRIENDLY_ID, TEAM, cacheCtx(friendly))?.valuations[0]?.auction_value,
    ).toBe(17);

    // 4. Back to Original — calibrated cache returns
    const backRes = await runStep("7_original_return", original, "", { clearDisplay: true });
    expect(backRes.valuations[0]?.auction_value).toBe(32);
    expect(log[3]!.phase).toBe("ready_sync");
    expect(log[3]!.peekTop).toBe(32);

    // 5. Log pick — roster fingerprint + invalidation
    const pickFp = rosterValuationFingerprint([
      {
        _id: "e1",
        externalPlayerId: "p1",
        teamId: TEAM,
        price: 25,
        rosterSlot: "C",
      } as never,
    ]);
    boards[ORIGINAL_ID] = boardWithTop(16, "post_pick");
    invalidateValuationCachesForLeague(ORIGINAL_ID, "roster_pick_logged");
    const postPickRes = await runStep("9_after_pick", original, pickFp);
    expect(postPickRes.valuations[0]?.auction_value).toBe(16);
    const keyAfterPick = log[4]!.cacheKey;
    expect(keyAfterPick).not.toBe(keyOriginalEmpty);
    expect(log[4]!.phase).not.toBe("ready_sync");

    // 6. Hard refresh — same post-pick economics from network (cache empty)
    const afterRefresh = await runStep("11_hard_refresh", original, pickFp, {
      hardRefresh: true,
    });
    expect(afterRefresh.valuations[0]?.auction_value).toBe(16);
    expect(log[5]!.phase).toBe("loading");

    // Cross-league: Original peek must not satisfy Demo context
    expect(
      peekBoardValuationCache(ORIGINAL_ID, TEAM, cacheCtx(demo, "")),
    ).toBeUndefined();

    // Cache key components present on every step
    for (const entry of log) {
      expect(entry.cacheKey).toContain("fresh-empty-opening-tiered-v2");
      expect(entry.cacheKey).toContain("replacement_slots_v2");
      expect(entry.cacheKey).toContain(TEAM);
    }
    expect(keyOriginalEmpty).toContain("stage3b_demo_v1");
    expect(log[1]!.cacheKey).toContain("fresh_board_linear");

    // No step served wrong-league peek as current without fetch
    expect(log[1]!.peekTop).toBeNull();
    expect(log[2]!.peekTop).toBeNull();
  });

  it("uses distinct keys for same empty roster across leagues (leagueId + opening profile)", () => {
    const original = leagueStub(ORIGINAL_ID, "Original");
    const friendly = leagueStub(FRIENDLY_ID, "Friendly");
    const fp = "";
    const k1 = buildValuationBoardCacheKey(ORIGINAL_ID, TEAM, cacheCtx(original, fp));
    const k2 = buildValuationBoardCacheKey(FRIENDLY_ID, TEAM, cacheCtx(friendly, fp));
    expect(k1).not.toBe(k2);
    expect(k1).toContain("stage3b_demo_v1");
    expect(k2).toContain("fresh_board_linear");
  });
});
