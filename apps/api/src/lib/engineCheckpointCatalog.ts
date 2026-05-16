import { readFileSync } from "fs";
import path from "path";

/** Canonical checkpoint ids (payload `checkpoint` field + API keys). */
export const ENGINE_CHECKPOINT_IDS = [
  "pre_draft",
  "after_pick_10",
  "after_pick_50",
  "after_pick_100",
  "after_pick_130",
  "finished_league",
] as const;

export type EngineCheckpointId = (typeof ENGINE_CHECKPOINT_IDS)[number];

/**
 * Draft repo filenames under test-fixtures/player-api/checkpoints/.
 * Engine repo uses after_pick_N.json for the same logical checkpoints — see ENGINE_AGENT_BRIEF.md.
 */
export const DRAFT_CHECKPOINT_FILENAME: Record<EngineCheckpointId, string> = {
  pre_draft: "pre_draft.json",
  after_pick_10: "after_10.json",
  after_pick_50: "after_50.json",
  after_pick_100: "after_100.json",
  after_pick_130: "after_130.json",
  finished_league: "finished_league.json",
};

/** Portal / Engine static filenames (AmethystAPI/public/fixtures/checkpoints/). */
export const ENGINE_PORTAL_CHECKPOINT_FILENAME: Record<EngineCheckpointId, string> =
  {
    pre_draft: "pre_draft.json",
    after_pick_10: "after_pick_10.json",
    after_pick_50: "after_pick_50.json",
    after_pick_100: "after_pick_100.json",
    after_pick_130: "after_pick_130.json",
    finished_league: "finished_league.json",
  };

export const CHECKPOINT_CATALOG_ENTRIES: ReadonlyArray<{
  id: EngineCheckpointId;
  title: string;
  draft_fixture_file: string;
  engine_portal_file: string;
}> = [
  {
    id: "pre_draft",
    title: "Pre-draft",
    draft_fixture_file: DRAFT_CHECKPOINT_FILENAME.pre_draft,
    engine_portal_file: ENGINE_PORTAL_CHECKPOINT_FILENAME.pre_draft,
  },
  {
    id: "after_pick_10",
    title: "After pick 10",
    draft_fixture_file: DRAFT_CHECKPOINT_FILENAME.after_pick_10,
    engine_portal_file: ENGINE_PORTAL_CHECKPOINT_FILENAME.after_pick_10,
  },
  {
    id: "after_pick_50",
    title: "After pick 50",
    draft_fixture_file: DRAFT_CHECKPOINT_FILENAME.after_pick_50,
    engine_portal_file: ENGINE_PORTAL_CHECKPOINT_FILENAME.after_pick_50,
  },
  {
    id: "after_pick_100",
    title: "After pick 100",
    draft_fixture_file: DRAFT_CHECKPOINT_FILENAME.after_pick_100,
    engine_portal_file: ENGINE_PORTAL_CHECKPOINT_FILENAME.after_pick_100,
  },
  {
    id: "after_pick_130",
    title: "After pick 130",
    draft_fixture_file: DRAFT_CHECKPOINT_FILENAME.after_pick_130,
    engine_portal_file: ENGINE_PORTAL_CHECKPOINT_FILENAME.after_pick_130,
  },
  {
    id: "finished_league",
    title: "Finished league",
    draft_fixture_file: DRAFT_CHECKPOINT_FILENAME.finished_league,
    engine_portal_file: ENGINE_PORTAL_CHECKPOINT_FILENAME.finished_league,
  },
];

export function resolveCheckpointsDir(): string {
  return path.join(process.cwd(), "test-fixtures", "player-api", "checkpoints");
}

export function readCheckpointFixtureJson(checkpointId: EngineCheckpointId): unknown {
  const dir = resolveCheckpointsDir();
  const file = DRAFT_CHECKPOINT_FILENAME[checkpointId];
  const raw = readFileSync(path.join(dir, file), "utf8");
  return JSON.parse(raw) as unknown;
}

export function isEngineCheckpointId(v: string): v is EngineCheckpointId {
  return (ENGINE_CHECKPOINT_IDS as readonly string[]).includes(v);
}
