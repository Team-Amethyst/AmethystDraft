import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import type { Player } from "../types/player";
import {
  addWatchlistEntry,
  deleteWatchlistEntry,
  getWatchlist,
  playerToWatchlistEntry,
  type WatchlistPlayer,
} from "../api/watchlist";

interface WatchlistContextType {
  getWatchlistForLeague: (leagueId: string) => WatchlistPlayer[];
  loadWatchlist: (leagueId: string) => Promise<void>;
  addToWatchlist: (leagueId: string, player: Player) => Promise<void>;
  removeFromWatchlist: (leagueId: string, playerId: string) => Promise<void>;
  isInWatchlist: (leagueId: string, playerId: string) => boolean;
}

const WatchlistContext = createContext<WatchlistContextType | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [watchlistByLeague, setWatchlistByLeague] = useState<
    Record<string, WatchlistPlayer[]>
  >({});

  const getWatchlistForLeague = useCallback(
    (leagueId: string) => watchlistByLeague[leagueId] ?? [],
    [watchlistByLeague],
  );

  const loadWatchlist = useCallback(
    async (leagueId: string) => {
      if (!token) return;

      const data = await getWatchlist(leagueId, token);
      setWatchlistByLeague((prev) => ({
        ...prev,
        [leagueId]: data,
      }));
    },
    [token],
  );

  const addToWatchlist = useCallback(
    async (leagueId: string, player: Player) => {
      if (!token) return;

      const entry = playerToWatchlistEntry(player);

      setWatchlistByLeague((prev) => {
        const current = prev[leagueId] ?? [];
        if (current.some((p) => p.id === player.id)) {
          return prev;
        }
        return {
          ...prev,
          [leagueId]: [...current, entry],
        };
      });

      try {
        await addWatchlistEntry(leagueId, entry, token);
      } catch (error) {
        setWatchlistByLeague((prev) => {
          const current = prev[leagueId] ?? [];
          return {
            ...prev,
            [leagueId]: current.filter((p) => p.id !== player.id),
          };
        });
        throw error;
      }
    },
    [token],
  );

  const removeFromWatchlist = useCallback(
    async (leagueId: string, playerId: string) => {
      if (!token) return;

      const previous = watchlistByLeague[leagueId] ?? [];

      setWatchlistByLeague((prev) => ({
        ...prev,
        [leagueId]: (prev[leagueId] ?? []).filter((p) => p.id !== playerId),
      }));

      try {
        await deleteWatchlistEntry(leagueId, playerId, token);
      } catch (error) {
        setWatchlistByLeague((prev) => ({
          ...prev,
          [leagueId]: previous,
        }));
        throw error;
      }
    },
    [token, watchlistByLeague],
  );

  const isInWatchlist = useCallback(
    (leagueId: string, playerId: string) =>
      (watchlistByLeague[leagueId] ?? []).some((p) => p.id === playerId),
    [watchlistByLeague],
  );

  return (
    <WatchlistContext.Provider
      value={{
        getWatchlistForLeague,
        loadWatchlist,
        addToWatchlist,
        removeFromWatchlist,
        isInWatchlist,
      }}
    >
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist(): WatchlistContextType {
  const context = useContext(WatchlistContext);

  if (!context) {
    throw new Error("useWatchlist must be used within a WatchlistProvider");
  }

  return context;
}