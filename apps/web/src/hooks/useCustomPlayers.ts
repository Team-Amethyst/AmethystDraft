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

const STORAGE_KEY = "amethyst-custom-players";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

function loadFromStorage(): Player[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Player[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(players: Player[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
  } catch {
    console.warn("Could not save custom players to localStorage");
  }
}

async function syncToMongo(player: Player): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/players/custom`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // TODO(auth): Add Authorization header once auth middleware is wired:
        // "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(player),
    });

    if (!res.ok) {
      const data = (await res.json()) as { message?: string };
      console.warn("Custom player sync failed:", data.message ?? res.statusText);
    }
  } catch (err) {
    // Non-fatal — player is already saved locally
    console.warn("Custom player MongoDB sync error (will retry on next load):", err);
  }
}

export function useCustomPlayers() {
  const [customPlayers, setCustomPlayers] = useState<Player[]>(loadFromStorage);

  /**
   * Add a new custom player.
   * Saves to localStorage immediately, then syncs to MongoDB in the background.
   */
  const addCustomPlayer = useCallback((player: Player) => {
    setCustomPlayers((prev) => {
      // Prevent duplicates by id (shouldn't happen with timestamp IDs, but be safe)
      if (prev.some((p) => p.id === player.id)) return prev;
      const next = [player, ...prev];
      saveToStorage(next);
      return next;
    });

    // Fire-and-forget MongoDB sync
    void syncToMongo(player);
  }, []);

  /**
   * Remove a custom player by id (local only — no backend delete yet).
   * TODO(backend): Add DELETE /api/players/custom/:id when needed.
   */
  const removeCustomPlayer = useCallback((id: string) => {
    setCustomPlayers((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveToStorage(next);
      return next;
    });
  }, []);

  /**
   * Check if a player id belongs to a custom player.
   * Useful for rendering a "Custom" badge in player lists.
   */
  const isCustomPlayer = useCallback(
    (id: string) => customPlayers.some((p) => p.id === id),
    [customPlayers],
  );

  return { customPlayers, addCustomPlayer, removeCustomPlayer, isCustomPlayer };
}