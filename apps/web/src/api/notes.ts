import { authHeaders, requestJson, requestVoid } from "./client";

export async function getNotes(
  leagueId: string,
  token: string,
): Promise<Record<string, string>> {
  return requestJson<Record<string, string>>(
    `/api/leagues/${leagueId}/notes`,
    {
      headers: authHeaders(token),
    },
    "Failed to fetch notes",
  );
}

export async function saveNote(
  leagueId: string,
  playerId: string,
  content: string,
  token: string,
): Promise<void> {
  return requestVoid(
    `/api/leagues/${leagueId}/notes/${encodeURIComponent(playerId)}`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ content }),
    },
    "Failed to save note",
  );
}
