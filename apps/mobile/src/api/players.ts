import type { Player } from "../types/player";
import { requestJson } from "./client";

interface PlayersResponse {
  players: Player[];
  count: number;
}

export async function getPlayers(
  sortBy: "adp" | "value" | "name" = "value",
  posEligibilityThreshold?: number,
  playerPool?: "Mixed" | "AL" | "NL",
): Promise<Player[]> {
  const query = new URLSearchParams({ sortBy });

  if (posEligibilityThreshold !== undefined) {
    query.set("posEligibilityThreshold", String(posEligibilityThreshold));
  }

  if (playerPool && playerPool !== "Mixed") {
    query.set("playerPool", playerPool);
  }

  const data = await requestJson<PlayersResponse>(
    "/api/players?" + query.toString(),
    {},
    "Failed to fetch players",
  );

  return data.players ?? [];
}