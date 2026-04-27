import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Player } from "../types/player";

const STORAGE_KEY = "amethyst-mobile-custom-players";

export interface CustomPlayerInput {
  name: string;
  team: string;
  position: string;
  adp?: number;
  value?: number;
  tier?: number;
  positions?: string[];
}

function normalizeToken(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function makeDuplicateKey(input: {
  name: string;
  team: string;
  position: string;
}): string {
  return [
    normalizeToken(input.name),
    normalizeToken(input.team),
    normalizeToken(input.position),
  ].join("::");
}

function normalizeInput(input: CustomPlayerInput): CustomPlayerInput {
  return {
    name: input.name.trim(),
    team: normalizeToken(input.team),
    position: normalizeToken(input.position),
    adp: input.adp ?? 999,
    value: input.value ?? 1,
    tier: input.tier ?? 5,
    positions:
      input.positions && input.positions.length > 0
        ? input.positions.map((p) => normalizeToken(p))
        : input.position
            .split("/")
            .map((p) => normalizeToken(p))
            .filter(Boolean),
  };
}

function toCustomPlayer(input: CustomPlayerInput, existingId?: string): Player {
  const normalized = normalizeInput(input);

  return {
    id: existingId ?? `custom:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    mlbId: 0,
    name: normalized.name,
    team: normalized.team,
    position: normalized.position,
    positions: normalized.positions,
    age: 0,
    adp: normalized.adp ?? 999,
    value: normalized.value ?? 1,
    tier: normalized.tier ?? 5,
    headshot: "",
    stats: {},
    projection: {},
    outlook: "Custom player",
    injuryStatus: undefined,
    springStats: {},
  };
}

export function useCustomPlayers() {
  const [customPlayers, setCustomPlayers] = useState<Player[]>([]);

  useEffect(() => {
    async function loadCustomPlayers() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          setCustomPlayers([]);
          return;
        }

        const parsed = JSON.parse(raw) as Player[];
        setCustomPlayers(Array.isArray(parsed) ? parsed : []);
      } catch {
        setCustomPlayers([]);
      }
    }

    void loadCustomPlayers();
  }, []);

  const persist = useCallback(async (next: Player[]) => {
    setCustomPlayers(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const duplicateEntries = useMemo(() => {
    return customPlayers.map((player) => ({
      id: player.id,
      key: makeDuplicateKey({
        name: player.name,
        team: player.team,
        position: player.position,
      }),
    }));
  }, [customPlayers]);

  const validateCustomPlayer = useCallback(
    (input: CustomPlayerInput, editingId?: string) => {
      const normalized = normalizeInput(input);

      if (!normalized.name) {
        throw new Error("Player name is required.");
      }

      if (!normalized.team) {
        throw new Error("Team is required.");
      }

      if (!normalized.position) {
        throw new Error("Position is required.");
      }

      if (!Number.isFinite(normalized.adp) || (normalized.adp ?? 0) < 0) {
        throw new Error("ADP must be a non-negative number.");
      }

      if (!Number.isFinite(normalized.value) || (normalized.value ?? 0) < 0) {
        throw new Error("Value must be a non-negative number.");
      }

      if (!Number.isFinite(normalized.tier) || (normalized.tier ?? 0) < 1) {
        throw new Error("Tier must be at least 1.");
      }

      const duplicateKey = makeDuplicateKey(normalized);
      const duplicate = duplicateEntries.find(
        (entry) => entry.key === duplicateKey && entry.id !== editingId,
      );

      if (duplicate) {
        throw new Error(
          "A custom player with the same name, team, and position already exists.",
        );
      }

      return normalized;
    },
    [duplicateEntries],
  );

  const addCustomPlayer = useCallback(
    async (input: CustomPlayerInput) => {
      const normalized = validateCustomPlayer(input);
      const player = toCustomPlayer(normalized);
      const next = [player, ...customPlayers];
      await persist(next);
      return player;
    },
    [customPlayers, persist, validateCustomPlayer],
  );

  const updateCustomPlayer = useCallback(
    async (playerId: string, input: CustomPlayerInput) => {
      const normalized = validateCustomPlayer(input, playerId);
      const next = customPlayers.map((player) =>
        player.id === playerId ? toCustomPlayer(normalized, playerId) : player,
      );
      await persist(next);
    },
    [customPlayers, persist, validateCustomPlayer],
  );

  const removeCustomPlayer = useCallback(
    async (playerId: string) => {
      const next = customPlayers.filter((player) => player.id !== playerId);
      await persist(next);
    },
    [customPlayers, persist],
  );

  const customPlayerIds = useMemo(
    () => new Set(customPlayers.map((player) => player.id)),
    [customPlayers],
  );

  const isCustomPlayer = useCallback(
    (id: string) => customPlayerIds.has(id),
    [customPlayerIds],
  );

  return {
    customPlayers,
    addCustomPlayer,
    updateCustomPlayer,
    removeCustomPlayer,
    isCustomPlayer,
  };
}