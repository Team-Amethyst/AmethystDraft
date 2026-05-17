/**
 * Client-side memoization for Engine valuation HTTP calls (board + per-player explain).
 * Does not change Engine math — only reduces duplicate network work for identical league state.
 */
import type { ValuationPlayerResponse, ValuationResponse } from "./engine";
import {
  __getValuationExecutors,
  __setValuationExecutorsForTests,
  executeCheckpointBoardValuationRequest,
  type ExecutePlayerValuationOptions,
} from "./engineValuationInternal";

export type ValuationBoardCacheContext = {
  /** Result of {@link ../utils/valuationDeps.leagueValuationConfigKey}. */
  leagueConfigKey: string;
  /** Result of {@link ../utils/valuationDeps.rosterValuationFingerprint}. */
  rosterFingerprint: string;
  /** Extra discriminator when engine context depends on local-only inputs (e.g. custom player ids). */
  extras?: string;
  /**
   * When set, calls POST `/api/engine/leagues/:id/valuation/checkpoint` with this key instead of
   * roster-derived valuation (bundled Draft fixtures → Engine flat body).
   */
  checkpointKey?: string | null;
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

/**
 * Player-explain payloads are keyed by the same board fingerprint (league config + roster +
 * inflation model + extras), so when any of those change the cache key changes and stale entries
 * become unreachable. The TTL only guards against in-session engine model drift; 30 minutes is
 * comfortably longer than typical SPA page-switching so returning to Command Center re-hydrates
 * the bid card instantly instead of waiting on a fresh engine round-trip.
 */
const PLAYER_EXPLAIN_TTL_MS = 30 * 60_000;

function logValuationCacheDev(
  event: "hit" | "miss" | "inflight" | "invalidate",
  scope: "board" | "player",
  detail: { reason: string; key: string },
): void {
  if (!import.meta.env.DEV) return;
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
    ctx.checkpointKey ?? "",
  ].join(SEP);
}

/** Synchronous read of a memoized board response (for loading / stale UI before `getValuation` resolves). */
export function peekBoardValuationCache(
  leagueId: string,
  userTeamId: string,
  ctx: ValuationBoardCacheContext,
): ValuationResponse | undefined {
  const key = buildValuationBoardCacheKey(leagueId, userTeamId, ctx);
  return boardResultCache.get(key);
}

export function isBoardValuationInflight(
  leagueId: string,
  userTeamId: string,
  ctx: ValuationBoardCacheContext,
): boolean {
  const key = buildValuationBoardCacheKey(leagueId, userTeamId, ctx);
  return boardInflight.has(key);
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

export async function fetchBoardValuationWithCache(args: {
  leagueId: string;
  token: string;
  userTeamId: string;
  devLogFocusPlayerId?: string | null;
  cacheContext: ValuationBoardCacheContext;
}): Promise<ValuationResponse> {
  const key = buildValuationBoardCacheKey(
    args.leagueId,
    args.userTeamId,
    args.cacheContext,
  );
  const hit = boardResultCache.get(key);
  if (hit) {
    logValuationCacheDev("hit", "board", {
      reason: "board_store",
      key,
    });
    return hit;
  }
  const inflight = boardInflight.get(key);
  if (inflight) {
    logValuationCacheDev("inflight", "board", {
      reason: "shared_promise",
      key,
    });
    return inflight;
  }

  logValuationCacheDev("miss", "board", { reason: "fetch", key });
  const ck = args.cacheContext.checkpointKey?.trim();
  const execBoard = ck
    ? () =>
        executeCheckpointBoardValuationRequest(
          args.leagueId,
          args.token,
          ck,
          args.userTeamId,
          args.devLogFocusPlayerId ?? null,
        )
    : () =>
        __getValuationExecutors().board(
          args.leagueId,
          args.token,
          args.userTeamId,
          args.devLogFocusPlayerId ?? null,
        );
  const p = execBoard()
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
    logValuationCacheDev("hit", "player", {
      reason: "player_store_ttl",
      key: pKey,
    });
    return cached.data;
  }

  const inflight = playerInflight.get(pKey);
  if (inflight) {
    logValuationCacheDev("inflight", "player", {
      reason: "shared_promise",
      key: pKey,
    });
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

/** Drops memoized board + player entries for one league (prefix match on cache keys). */
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

  logValuationCacheDev("invalidate", "board", {
    reason,
    key: `${boardPrefix}*`,
  });
}

export function __resetValuationCachesForTests(): void {
  boardResultCache.clear();
  boardInflight.clear();
  playerResultCache.clear();
  playerInflight.clear();
  __setValuationExecutorsForTests(null);
}
