import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useParams } from "react-router";
import { useAuth } from "./AuthContext";
import {
  getWatchlist,
  addWatchlistEntry,
  deleteWatchlistEntry,
  type WatchlistPlayer,
} from "../api/watchlist";
import type { Player } from "../types/player";

interface WatchlistContextType {
  watchlist: WatchlistPlayer[];
  addToWatchlist: (player: Player) => void;
  removeFromWatchlist: (playerId: string) => void;
  isInWatchlist: (playerId: string) => boolean;
}

const WatchlistContext = createContext<WatchlistContextType>({
  watchlist: [],
  addToWatchlist: () => {},
  removeFromWatchlist: () => {},
  isInWatchlist: () => false,
});

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const { id: leagueId } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [watchlist, setWatchlist] = useState<WatchlistPlayer[]>([]);

  // Load watchlist from DB when mounted (key={leagueId} on provider ensures remount on league change)
  useEffect(() => {
    if (!leagueId || !token) return;
    let cancelled = false;
    getWatchlist(leagueId, token)
      .then((data) => {
        if (!cancelled) setWatchlist(data);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [leagueId, token]);

  const addToWatchlist = useCallback(
    (player: Player) => {
      const entry: WatchlistPlayer = {
        id: player.id,
        name: player.name,
        team: player.team,
        position: player.position,
        positions: player.positions,
        adp: player.adp,
        value: player.value,
        tier: player.tier,
        baseline_value: player.baseline_value,
        adjusted_value: player.adjusted_value,
        recommended_bid: player.recommended_bid,
        team_adjusted_value: player.team_adjusted_value,
      };
      setWatchlist((prev) => {
        if (prev.find((p) => p.id === player.id)) return prev;
        return [...prev, entry];
      });
      if (leagueId && token) {
        addWatchlistEntry(leagueId, entry, token).catch(console.error);
      }
    },
    [leagueId, token],
  );

  const removeFromWatchlist = useCallback(
    (playerId: string) => {
      setWatchlist((prev) => prev.filter((p) => p.id !== playerId));
      if (leagueId && token) {
        deleteWatchlistEntry(leagueId, playerId, token).catch(console.error);
      }
    },
    [leagueId, token],
  );

  const isInWatchlist = useCallback(
    (playerId: string) => watchlist.some((p) => p.id === playerId),
    [watchlist],
  );

  return (
    <WatchlistContext.Provider
      value={{ watchlist, addToWatchlist, removeFromWatchlist, isInWatchlist }}
    >
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  return useContext(WatchlistContext);
}
