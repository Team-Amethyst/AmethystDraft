/**
 * useCustomPlayers
 *
 * Manages custom (manually added) players:
 *  1. Stores them in localStorage immediately (survives page refresh)
 *  2. Merges them into the player list alongside MLB API players
 *  3. Syncs to MongoDB in the background via POST /api/players/custom
 *
 * Usage:
 *   const { customPlayers, addCustomPlayer } = useCustomPlayers();
 *
 *   // In your player list:
 *   const allPlayers = [...players, ...customPlayers];
 */

import { useState, useCallback } from "react";
import type { Player } from "../types/player";
import { useAuth } from "../contexts/AuthContext";
import { buildApiUrl } from "../api/client";

// Key is now scoped to userId so each user has their own list
function storageKey(userId: string) {
  return `amethyst-custom-players-${userId}`;
}

function loadFromStorage(userId: string): Player[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as Player[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(userId: string, players: Player[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(players));
  } catch {
    console.warn("Could not save custom players to localStorage");
  }
}

async function syncToMongo(player: Player, token: string): Promise<void> {
  try {
    const res = await fetch(buildApiUrl("/api/players/custom"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(player),
    });
    if (!res.ok) {
      const data = (await res.json()) as { message?: string };
      console.warn("Custom player sync failed:", data.message ?? res.statusText);
    }
  } catch (err) {
    console.warn("Custom player MongoDB sync error:", err);
  }
}

export function useCustomPlayers() {
  const { user, token } = useAuth();
  const userId = user?.id ?? "anonymous";

  const [customPlayers, setCustomPlayers] = useState<Player[]>(
    () => loadFromStorage(userId),
  );

  const addCustomPlayer = useCallback((player: Player) => {
    setCustomPlayers((prev) => {
      if (prev.some((p) => p.id === player.id)) return prev;
      const next = [player, ...prev];
      saveToStorage(userId, next);
      return next;
    });
    if (token) void syncToMongo(player, token);
  }, [userId, token]);

  const removeCustomPlayer = useCallback((id: string) => {
    setCustomPlayers((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveToStorage(userId, next);
      return next;
    });
  }, [userId]);

  const isCustomPlayer = useCallback(
    (id: string) => customPlayers.some((p) => p.id === id),
    [customPlayers],
  );

  return { customPlayers, addCustomPlayer, removeCustomPlayer, isCustomPlayer };
}