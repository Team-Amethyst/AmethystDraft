import { useEffect, useMemo, useRef, useState } from "react";
import { getPlayers } from "../api/players";
import {
  getRoster,
  getRosterCached,
  removeRosterEntry,
  updateRosterEntry,
} from "../api/roster";
import type { RosterEntry } from "../api/roster";
import { useLeague, type League } from "../contexts/LeagueContext";
import type { Player } from "../types/player";
import { getValuation, type ValuationResponse } from "../api/engine";
import {
  buildValuationBoardCacheKey,
  peekBoardValuationCache,
} from "../api/valuationCache";
import { classifyBoardValuationFetchPhase } from "../domain/boardValuationFetchPhase";
import type { BoardValuationUiPhase } from "../domain/boardValuationFetchPhase";
import { leagueValuationConfigKey, rosterValuationFingerprint } from "../utils/valuationDeps";

export function useCommandCenterData({
  leagueId,
  token,
  league,
  userTeamIdForValuation,
  valuationBoardLogPlayerId,
}: {
  leagueId: string | undefined;
  token: string | null;
  league: League | null;
  userTeamIdForValuation: string;
  valuationBoardLogPlayerId: string | undefined;
}) {
  const { refreshLeagues } = useLeague();
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);
  const [mlbPlayers, setMlbPlayers] = useState<Player[]>([]);
  const [engineMarket, setEngineMarket] = useState<ValuationResponse | null>(null);
  const [engineBoardPhase, setEngineBoardPhase] = useState<BoardValuationUiPhase>("idle");
  const [engineBoardError, setEngineBoardError] = useState<string | null>(null);
  const boardSuccessKeyRef = useRef<string | null>(null);
  const engineMarketRef = useRef<ValuationResponse | null>(null);
  /**
   * Tracks whether the initial roster fetch has resolved for the current league/token. Used to
   * defer the board valuation fetch until the real roster fingerprint is known — otherwise we'd
   * burn one round-trip on a cache key keyed by an empty roster every time the page mounts.
   */
  const [rosterLoaded, setRosterLoaded] = useState(false);

  const refreshRoster = () => {
    if (!leagueId || !token) return;
    void getRoster(leagueId, token).then(setRosterEntries).catch(console.error);
  };

  useEffect(() => {
    boardSuccessKeyRef.current = null;
    setEngineMarket(null);
    setEngineBoardPhase("idle");
    setEngineBoardError(null);
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) {
      setRosterEntries([]);
      setRosterLoaded(false);
      return;
    }
    setRosterEntries(getRosterCached(leagueId) ?? []);
    if (!token) return;
    setRosterLoaded(false);
    void getRoster(leagueId, token)
      .then((entries) => {
        setRosterEntries(entries);
        setRosterLoaded(true);
      })
      .catch(console.error);
  }, [leagueId, token]);

  const rosterValuationKey = useMemo(
    () => rosterValuationFingerprint(rosterEntries),
    [rosterEntries],
  );

  useEffect(() => {
    engineMarketRef.current = engineMarket;
  }, [engineMarket]);

  const leagueValuationKey = useMemo(
    () => leagueValuationConfigKey(league ?? null),
    [
      league?.id,
      league?.teams,
      league?.budget,
      league ? JSON.stringify(league.rosterSlots) : "",
      league ? JSON.stringify(league.scoringCategories) : "",
      league?.memberIds?.join(","),
      league?.posEligibilityThreshold,
      league?.playerPool,
      league?.teamNames?.join("\u0001"),
    ],
  );

  useEffect(() => {
    // Defer until league row exists: `leagueValuationConfigKey(null)` is "" and the board cache
    // key would not match the post-load fetch (duplicate POST while first is in flight).
    if (!leagueId || !token || !rosterLoaded || !leagueValuationKey) {
      setEngineBoardPhase("idle");
      setEngineBoardError(null);
      return;
    }

    const cacheCtx = {
      leagueConfigKey: leagueValuationKey,
      rosterFingerprint: rosterValuationKey,
    };
    const activeCacheKey = buildValuationBoardCacheKey(
      leagueId,
      userTeamIdForValuation,
      cacheCtx,
    );
    const peek = peekBoardValuationCache(leagueId, userTeamIdForValuation, cacheCtx);
    const pre = classifyBoardValuationFetchPhase({
      canStartFetch: true,
      peekHit: peek !== undefined,
      activeCacheKey,
      lastSuccessCacheKey: boardSuccessKeyRef.current,
      displayedBoardPresent: engineMarketRef.current !== null,
    });

    if (pre === "ready_sync") {
      setEngineBoardPhase("ready");
      setEngineBoardError(null);
    } else if (pre === "refreshing") {
      setEngineBoardPhase("refreshing");
      setEngineBoardError(null);
    } else {
      setEngineBoardPhase("loading");
      setEngineBoardError(null);
    }

    let cancelled = false;
    void getValuation(
      leagueId,
      token,
      userTeamIdForValuation,
      valuationBoardLogPlayerId ?? null,
      cacheCtx,
    )
      .then((res) => {
        if (!cancelled) {
          boardSuccessKeyRef.current = activeCacheKey;
          setEngineMarket(res);
          setEngineBoardPhase("ready");
          setEngineBoardError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEngineBoardPhase("error");
          setEngineBoardError("Unable to refresh league valuation.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    leagueId,
    token,
    userTeamIdForValuation,
    rosterValuationKey,
    leagueValuationKey,
    valuationBoardLogPlayerId,
    rosterLoaded,
  ]);

  useEffect(() => {
    void getPlayers(
      "catalog_rank",
      league?.posEligibilityThreshold,
      league?.playerPool,
    )
      .then(setMlbPlayers)
      .catch(console.error);
  }, [league?.posEligibilityThreshold, league?.playerPool]);

  const removePick = async (entryId: string): Promise<RosterEntry | undefined> => {
    if (!leagueId || !token) return undefined;
    const entry = rosterEntries.find((e) => e._id === entryId);
    setRosterEntries((prev) => prev.filter((e) => e._id !== entryId));
    try {
      await removeRosterEntry(leagueId, entryId, token);
      void refreshLeagues();
      return entry;
    } catch (err) {
      refreshRoster();
      throw err;
    }
  };

  const updatePick = async (
    entryId: string,
    data: {
      price?: number;
      rosterSlot?: string;
      teamId?: string;
      keeperContract?: string;
    },
  ): Promise<RosterEntry | undefined> => {
    if (!leagueId || !token) return undefined;
    const prev = rosterEntries.find((e) => e._id === entryId);
    setRosterEntries((entries) =>
      entries.map((e) => (e._id === entryId ? { ...e, ...data } : e)),
    );
    try {
      await updateRosterEntry(leagueId, entryId, data, token);
      void refreshLeagues();
      return prev;
    } catch (err) {
      refreshRoster();
      throw err;
    }
  };

  return {
    rosterEntries,
    mlbPlayers,
    engineMarket,
    engineBoardPhase,
    engineBoardError,
    setRosterEntries,
    refreshRoster,
    removePick,
    updatePick,
  };
}
