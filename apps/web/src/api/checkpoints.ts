import { requireAuthHeaders, requestJson } from "./client";

export type EngineCheckpointCatalogEntry = {
  id:
    | "pre_draft"
    | "after_pick_10"
    | "after_pick_50"
    | "after_pick_100"
    | "after_pick_130"
    | "finished_league";
  title: string;
  draft_fixture_file: string;
  engine_portal_file: string;
};

export async function fetchEngineCheckpointCatalog(token: string): Promise<
  EngineCheckpointCatalogEntry[]
> {
  const data = await requestJson<{ checkpoints: EngineCheckpointCatalogEntry[] }>(
    "/api/engine/checkpoints",
    { headers: requireAuthHeaders(token) },
    "Failed to load checkpoint catalog",
  );
  return data.checkpoints ?? [];
}

export async function fetchEngineCheckpointJson(
  token: string,
  checkpointKey: EngineCheckpointCatalogEntry["id"],
): Promise<unknown> {
  return requestJson<unknown>(
    `/api/engine/checkpoints/${encodeURIComponent(checkpointKey)}/json`,
    { headers: requireAuthHeaders(token) },
    "Failed to load checkpoint fixture",
  );
}
