import { authHeaders, requestJson } from "./client";
import type { EngineCheckpointKey } from "./leagues";

export type EngineCheckpointCatalogEntry = {
  id: EngineCheckpointKey;
  title: string;
  draft_fixture_file: string;
  engine_portal_file: string;
};

export async function fetchEngineCheckpointCatalog(
  token: string,
): Promise<EngineCheckpointCatalogEntry[]> {
  const data = await requestJson<{ checkpoints: EngineCheckpointCatalogEntry[] }>(
    "/api/engine/checkpoints",
    {
      headers: authHeaders(token),
    },
    "Failed to load checkpoint catalog",
  );

  return data.checkpoints ?? [];
}

export async function fetchEngineCheckpointJson(
  token: string,
  checkpointKey: EngineCheckpointKey,
): Promise<unknown> {
  return requestJson<unknown>(
    `/api/engine/checkpoints/${encodeURIComponent(checkpointKey)}/json`,
    {
      headers: authHeaders(token),
    },
    "Failed to load checkpoint fixture",
  );
}
