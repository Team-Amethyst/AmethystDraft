/**
 * Client-side memoization for Engine valuation HTTP (board + per-player).
 * Mirrors apps/web so mobile and web share cache-key semantics for the same league state.
 */
import type { ValuationPlayerResponse, ValuationResponse } from "./engine";
import {
  __getValuationExecutors,
  __setValuationExecutorsForTests,
  type ExecutePlayerValuationOptions,
} from "./engineValuationExecute";

export type ValuationBoardCacheContext = {
  leagueConfigKey: string;
  rosterFingerprint: string;
  extras?: string;
};

const SEP = "\u001f";
const BOARD_INFLATION_MODEL = "replacement_slots_v2";

const boardResultCache = new Map<string, ValuationResponse>();
const boardInflight = new Map<string, Promise<ValuationResponse>>();

type PlayerCacheEntry = {
  expiresAt: number;
  data: ValuationPlayerResponse;
};
const playerResultCache = new Map<string, PlayerCacheEntry>();
const playerInflight = new Map<string, Promise<ValuationPlayerResponse>>();

const PLAYER_EXPLAIN_TTL_MS = 30 * 60_000;

function logValuationCacheDev(
  event: "hit" | "miss" | "inflight" | "invalidate",
  scope: "board" | "player",
  detail: { reason: string; key: string },
): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.info("[valuation-cache]", {
    event,
    scope,
    reason: detail.reason,
    cacheKey: detail.key,
  });
}

export function buildValuationBoardCacheKey(
  leagueId: string,
  userTeamId: string,
  ctx: ValuationBoardCacheContext,
): string {
  return [
    leagueId,
    userTeamId,
    BOARD_INFLATION_MODEL,
    ctx.leagueConfigKey,
    ctx.rosterFingerprint,
    ctx.extras ?? "",
  ].join(SEP);
}

export function peekBoardValuationCache(
  leagueId: string,
  userTeamId: string,
  ctx: ValuationBoardCacheContext,
): ValuationResponse | undefined {
  const key = buildValuationBoardCacheKey(leagueId, userTeamId, ctx);
  return boardResultCache.get(key);
}

export async function fetchBoardValuationWithCache(args: {
  leagueId: string;
  token: string;
  userTeamId: string;
  cacheContext: ValuationBoardCacheContext;
}): Promise<ValuationResponse> {
  const key = buildValuationBoardCacheKey(
    args.leagueId,
    args.userTeamId,
    args.cacheContext,
  );
  const hit = boardResultCache.get(key);
  if (hit) {
    logValuationCacheDev("hit", "board", { reason: "board_store", key });
    return hit;
  }
  const inflight = boardInflight.get(key);
  if (inflight) {
    logValuationCacheDev("inflight", "board", { reason: "shared_promise", key });
    return inflight;
  }

  logValuationCacheDev("miss", "board", { reason: "fetch", key });
  const exec = __getValuationExecutors().board;
  const p = exec(args.leagueId, args.token, args.userTeamId)
    .then((res) => {
      boardResultCache.set(key, res);
      boardInflight.delete(key);
      return res;
    })
    .catch((err) => {
      boardInflight.delete(key);
      throw err;
    });
  boardInflight.set(key, p);
  return p;
}

function buildPlayerCacheKey(
  boardKey: string,
  playerId: string,
  explainValuationRows: boolean,
): string {
  const pid = String(playerId).trim();
  return ["player", boardKey, pid, explainValuationRows ? "explain:1" : "explain:0"].join(
    SEP,
  );
}

export async function fetchPlayerValuationWithCache(args: {
  leagueId: string;
  token: string;
  playerId: string;
  userTeamId: string;
  options?: ExecutePlayerValuationOptions;
  cacheContext?: ValuationBoardCacheContext;
}): Promise<ValuationPlayerResponse> {
  const explain = args.options?.explainValuationRows === true;
  if (!args.cacheContext) {
    return __getValuationExecutors().player(
      args.leagueId,
      args.token,
      args.playerId,
      args.userTeamId,
      args.options,
    );
  }

  const boardKey = buildValuationBoardCacheKey(
    args.leagueId,
    args.userTeamId,
    args.cacheContext,
  );
  const pKey = buildPlayerCacheKey(boardKey, args.playerId, explain);

  const now = Date.now();
  const cached = playerResultCache.get(pKey);
  if (cached && cached.expiresAt > now) {
    logValuationCacheDev("hit", "player", { reason: "player_store_ttl", key: pKey });
    return cached.data;
  }

  const inflight = playerInflight.get(pKey);
  if (inflight) {
    logValuationCacheDev("inflight", "player", { reason: "shared_promise", key: pKey });
    return inflight;
  }

  logValuationCacheDev("miss", "player", { reason: "fetch", key: pKey });
  const exec = __getValuationExecutors().player;
  const execOpts: ExecutePlayerValuationOptions = {
    explainValuationRows: args.options?.explainValuationRows,
  };
  const promise = exec(
    args.leagueId,
    args.token,
    args.playerId,
    args.userTeamId,
    execOpts,
  )
    .then((res) => {
      playerResultCache.set(pKey, {
        expiresAt: Date.now() + PLAYER_EXPLAIN_TTL_MS,
        data: res,
      });
      playerInflight.delete(pKey);
      return res;
    })
    .catch((err) => {
      playerInflight.delete(pKey);
      throw err;
    });
  playerInflight.set(pKey, promise);
  return promise;
}

export function invalidateValuationCachesForLeague(
  leagueId: string,
  reason: string,
): void {
  const boardPrefix = leagueId + SEP;
  const playerLeaguePrefix = "player" + SEP + leagueId + SEP;

  for (const key of [...boardResultCache.keys()]) {
    if (key.startsWith(boardPrefix)) boardResultCache.delete(key);
  }
  for (const key of [...boardInflight.keys()]) {
    if (key.startsWith(boardPrefix)) boardInflight.delete(key);
  }
  for (const key of [...playerResultCache.keys()]) {
    if (key.startsWith(playerLeaguePrefix)) playerResultCache.delete(key);
  }
  for (const key of [...playerInflight.keys()]) {
    if (key.startsWith(playerLeaguePrefix)) playerInflight.delete(key);
  }

  logValuationCacheDev("invalidate", "board", { reason, key: `${boardPrefix}*` });
}

export function __resetValuationCachesForTests(): void {
  boardResultCache.clear();
  boardInflight.clear();
  playerResultCache.clear();
  playerInflight.clear();
  __setValuationExecutorsForTests(null);
}
