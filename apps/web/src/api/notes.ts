const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:3001";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function getNotes(
  leagueId: string,
  token: string,
): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/api/leagues/${leagueId}/notes`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch notes");
  return res.json() as Promise<Record<string, string>>;
}

export async function saveNote(
  leagueId: string,
  playerId: string,
  content: string,
  token: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/leagues/${leagueId}/notes/${encodeURIComponent(playerId)}`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ content }),
    },
  );
  if (!res.ok) throw new Error("Failed to save note");
}
