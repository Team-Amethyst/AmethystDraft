import React, { createContext, useContext, useState, useEffect } from "react";
import type { Player } from "../types/player";

interface WatchlistContextType {
  watchlist: Player[];
  addToWatchlist: (player: Player) => void;
  removeFromWatchlist: (playerId: string) => void;
  isInWatchlist: (playerId: string) => boolean;
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(
  undefined,
);

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [watchlist, setWatchlist] = useState<Player[]>(() => {
    const saved = localStorage.getItem("amethyst-watchlist");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem("amethyst-watchlist", JSON.stringify(watchlist));
  }, [watchlist]);

  const addToWatchlist = (player: Player) => {
    setWatchlist((prev) => {
      if (prev.find((p) => p.id === player.id)) return prev;
      return [...prev, player];
    });
  };

  const removeFromWatchlist = (playerId: string) => {
    setWatchlist((prev) => prev.filter((p) => p.id !== playerId));
  };

  const isInWatchlist = (playerId: string) => {
    return watchlist.some((p) => p.id === playerId);
  };

  return (
    <WatchlistContext.Provider
      value={{ watchlist, addToWatchlist, removeFromWatchlist, isInWatchlist }}
    >
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error("useWatchlist must be used within a WatchlistProvider");
  }
  return context;
}
