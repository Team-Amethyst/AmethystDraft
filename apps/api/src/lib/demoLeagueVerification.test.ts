import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { valuationIncomingSchema } from "../validation/schemas";
import { extractCheckpointLeagueAndRoster } from "./leagueFromEngineCheckpoint";
import {
  assertMatchesGolden,
  loadPreDraftFixtureJson,
  statsFromCheckpointJson,
} from "./demoLeagueVerification";
import { DEMO_PRE_DRAFT_GOLDEN } from "./demoLeagueFixtureGolden";

describe("demo league fixture load (import path)", () => {
  it("pre_draft.json matches workbook golden counts after extractCheckpointLeagueAndRoster", () => {
    const raw = loadPreDraftFixtureJson();
    const stats = statsFromCheckpointJson(raw, "fixture");
    const errors = assertMatchesGolden(stats);
    expect(errors, errors.join("\n")).toEqual([]);
    expect(stats.unresolvedSyntheticIds.length).toBeGreaterThan(0);

    const parsed = valuationIncomingSchema.parse(raw);
    const extracted = extractCheckpointLeagueAndRoster(parsed);
    expect(extracted.teamNames).toEqual([
      "Team A",
      "Team B",
      "Team C",
      "Team D",
      "Team E",
      "Team F",
      "Team G",
      "Team H",
      "Team I",
    ]);
  });

  it("after_130.json includes 130 draft picks (full workbook has 133)", () => {
    const file = path.join(
      process.cwd(),
      "test-fixtures",
      "player-api",
      "checkpoints",
      "after_130.json",
    );
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const stats = statsFromCheckpointJson(raw, "fixture");
    expect(stats.draftPickCountInFixture).toBe(130);
    expect(DEMO_PRE_DRAFT_GOLDEN.draftPickCountFullWorkbook).toBe(133);
  });
});
