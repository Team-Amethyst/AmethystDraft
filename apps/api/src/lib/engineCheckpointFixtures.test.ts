import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { valuationIncomingSchema } from "../validation/schemas";
import {
  CHECKPOINT_CATALOG_ENTRIES,
  DRAFT_CHECKPOINT_FILENAME,
  ENGINE_CHECKPOINT_IDS,
  readCheckpointFixtureJson,
  type EngineCheckpointId,
} from "./engineCheckpointCatalog";
import { extractCheckpointLeagueAndRoster } from "./leagueFromEngineCheckpoint";
import { isReserveRosterSlot } from "./demoLeagueFixtureGolden";

const EXPECTED_DRAFT_LEN: Record<EngineCheckpointId, number> = {
  pre_draft: 0,
  after_pick_10: 10,
  after_pick_50: 50,
  after_pick_100: 100,
  after_pick_130: 130,
  finished_league: 133,
};

function draftStateLength(raw: unknown): number {
  const parsed = valuationIncomingSchema.parse(raw);
  if (parsed.format === "nested") {
    return parsed.data.draft_state.length;
  }
  return parsed.data.drafted_players?.length ?? 0;
}

function auctionRowsFromDraftState(raw: unknown): { paid?: number }[] {
  const parsed = valuationIncomingSchema.parse(raw);
  if (parsed.format === "nested") {
    return parsed.data.draft_state as { paid?: number }[];
  }
  return (parsed.data.drafted_players ?? []) as { paid?: number }[];
}

describe("bundled engine checkpoint fixtures", () => {
  it.each(ENGINE_CHECKPOINT_IDS)(
    "%s has draft_state.length === %i",
    (id) => {
      const raw = readCheckpointFixtureJson(id);
      expect(draftStateLength(raw)).toBe(EXPECTED_DRAFT_LEN[id]);
    },
  );

  it("catalog maps each id to a distinct fixture file and draft slice", () => {
    const seen = new Set<string>();
    for (const entry of CHECKPOINT_CATALOG_ENTRIES) {
      expect(entry.draft_fixture_file).toBe(DRAFT_CHECKPOINT_FILENAME[entry.id]);
      const len = draftStateLength(readCheckpointFixtureJson(entry.id));
      const key = `${entry.draft_fixture_file}:${len}`;
      expect(seen.has(key), `duplicate slice for ${entry.id}`).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(ENGINE_CHECKPOINT_IDS.length);
  });

  it("finished_league uses full Draft sheet (133 picks), not Final Roster embed", () => {
    const raw = readCheckpointFixtureJson("finished_league");
    const parsed = valuationIncomingSchema.parse(raw);
    expect(parsed.format).toBe("nested");
    if (parsed.format !== "nested") return;
    expect(parsed.data.checkpoint).toBe("finished_league");
    expect(parsed.data.draft_state).toHaveLength(133);
  });

  it("auction picks in draft_state never have missing or zero paid", () => {
    for (const id of ENGINE_CHECKPOINT_IDS) {
      if (id === "pre_draft") continue;
      const rows = auctionRowsFromDraftState(readCheckpointFixtureJson(id));
      const bad = rows.filter(
        (p) =>
          p.paid == null ||
          p.paid === 0 ||
          !Number.isFinite(Number(p.paid)) ||
          Number(p.paid) <= 0,
      );
      expect(bad, `${id} bad auction salaries`).toHaveLength(0);
    }
  });

  it("minors/taxi import as price 0 reserves excluded from auction spend rows", () => {
    for (const id of ["pre_draft", "after_pick_10", "finished_league"] as const) {
      const extracted = extractCheckpointLeagueAndRoster(
        valuationIncomingSchema.parse(readCheckpointFixtureJson(id)),
      );
      const reserves = extracted.rosterRows.filter((r) =>
        isReserveRosterSlot(r.rosterSlot),
      );
      expect(reserves.length).toBeGreaterThan(0);
      expect(reserves.every((r) => r.price === 0)).toBe(true);
      expect(reserves.every((r) => !r.isKeeper)).toBe(true);

      const auctionRows = extracted.rosterRows.filter(
        (r) => !r.isKeeper && !isReserveRosterSlot(r.rosterSlot),
      );
      expect(auctionRows.length).toBe(EXPECTED_DRAFT_LEN[id]);
      expect(auctionRows.every((r) => r.price > 0)).toBe(true);
    }
  });

  it("checkpoint JSON files differ by content hash", () => {
    const hashes = new Map<string, string>();
    for (const id of ENGINE_CHECKPOINT_IDS) {
      const file = DRAFT_CHECKPOINT_FILENAME[id];
      const raw = readCheckpointFixtureJson(id);
      const hash = createHash("sha256")
        .update(JSON.stringify(raw))
        .digest("hex");
      const prev = hashes.get(hash);
      expect(prev, `${id} (${file}) duplicates ${prev}`).toBeUndefined();
      hashes.set(hash, id);
    }
  });
});
