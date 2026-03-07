import type { Player } from "../types/player";

const API_BASE =
  import.meta.env.VITE_API_URL ||
  "https://at5ms22dhj.us-east-1.awsapprunner.com";

interface PlayersResponse {
  players: Player[];
  count: number;
}

export async function getPlayers(
  sortBy: "adp" | "value" | "name" = "value",
): Promise<Player[]> {
  const query = new URLSearchParams({ sortBy });
  const res = await fetch(API_BASE + "/api/players?" + query.toString());
  const data = (await res.json()) as PlayersResponse;
  if (!res.ok) {
    throw new Error(
      (data as { message?: string }).message || "Failed to fetch players",
    );
  }
  return data.players ?? [];
}
