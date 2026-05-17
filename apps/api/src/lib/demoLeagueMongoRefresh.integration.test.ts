import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import League from "../models/League";
import RosterEntry from "../models/RosterEntry";
import { valuationIncomingSchema } from "../validation/schemas";
import { extractCheckpointLeagueAndRoster } from "./leagueFromEngineCheckpoint";
import {
  assertMatchesGolden,
  formatDemoLeagueStatsReport,
  loadCheckpointFixtureJsonById,
  resolveDemoRefreshCheckpointKey,
  statsFromCheckpointJson,
  type DemoLeagueStats,
} from "./demoLeagueVerification";
import type { EngineCheckpointId } from "./engineCheckpointCatalog";
import { isReserveRosterSlot, fantasyNameForTeamId } from "./demoLeagueFixtureGolden";

const RUN_REFRESH = process.env.DEMO_LEAGUE_REFRESH === "1";

async function statsFromMongoLeague(
  leagueId: mongoose.Types.ObjectId,
  teams: number,
  remainingBudgetsByFantasy: Record<string, number>,
): Promise<DemoLeagueStats> {
  const entries = await RosterEntry.find({ leagueId }).lean();
  const keeperCountsByFantasy: Record<string, number> = {};
  const minorsCountsByFantasy: Record<string, number> = {};
  const taxiCountsByFantasy: Record<string, number> = {};
  let activeAuctionSlotCount = 0;
  const unresolvedSyntheticIds = new Set<string>();

  for (const e of entries) {
    const fantasy = fantasyNameForTeamId(e.teamId);
    if (e.isKeeper && !isReserveRosterSlot(e.rosterSlot)) {
      keeperCountsByFantasy[fantasy] = (keeperCountsByFantasy[fantasy] ?? 0) + 1;
    } else if (e.rosterSlot.toUpperCase().includes("MIN")) {
      minorsCountsByFantasy[fantasy] = (minorsCountsByFantasy[fantasy] ?? 0) + 1;
    } else if (e.rosterSlot.toUpperCase().includes("TAXI")) {
      taxiCountsByFantasy[fantasy] = (taxiCountsByFantasy[fantasy] ?? 0) + 1;
    } else if (!e.isKeeper) {
      activeAuctionSlotCount += 1;
    }
    if (String(e.externalPlayerId).startsWith("fixture_unresolved_")) {
      unresolvedSyntheticIds.add(String(e.externalPlayerId));
    }
  }

  return {
    source: "mongo",
    teamCount: teams,
    keeperCountsByFantasy,
    remainingBudgetsByFantasy,
    draftPickCountInFixture: 0,
    minorsCountsByFantasy,
    taxiCountsByFantasy,
    activeAuctionSlotCount,
    unresolvedSyntheticIds: [...unresolvedSyntheticIds].sort(),
  };
}

describe.skipIf(!RUN_REFRESH)("demo league mongo refresh", () => {
  it("replaces demo league roster from bundled checkpoint fixture", async () => {
    const checkpointKey: EngineCheckpointId = resolveDemoRefreshCheckpointKey();
    const uri =
      process.env.MONGO_URI ??
      process.env.MONGODB_URI ??
      "mongodb://127.0.0.1:27017/amethystdraft";

    const raw = loadCheckpointFixtureJsonById(checkpointKey);
    const fixtureStats = statsFromCheckpointJson(raw, "fixture");
    if (checkpointKey === "pre_draft") {
      expect(assertMatchesGolden(fixtureStats)).toEqual([]);
    }

    await mongoose.connect(uri);

    const leagueNamePattern =
      checkpointKey === "pre_draft"
        ? /\[Demo\]\s*pre\s*draft/i
        : new RegExp(
            `\\[Demo\\]\\s*${checkpointKey.replace(/_/g, "[\\s_]+")}`,
            "i",
          );

    const league = await League.findOne({
      name: leagueNamePattern,
    })
      .sort({ createdAt: -1 })
      .exec();

    expect(
      league,
      `create [Demo] ${checkpointKey.replace(/_/g, " ")} league first`,
    ).toBeTruthy();
    if (!league) return;

    const before = await statsFromMongoLeague(
      league._id,
      league.teams,
      fixtureStats.remainingBudgetsByFantasy,
    );
    before.leagueId = String(league._id);
    before.leagueName = league.name;
    before.createdAt = league.createdAt?.toISOString();

    // eslint-disable-next-line no-console -- operational verification dump
    console.info("\n── Mongo BEFORE refresh ──\n", formatDemoLeagueStatsReport(before));

    const parsed = valuationIncomingSchema.parse(raw);
    const extracted = extractCheckpointLeagueAndRoster(parsed);

    league.teamNames = extracted.teamNames;
    await league.save();

    await RosterEntry.deleteMany({ leagueId: league._id });

    const teams = extracted.teams;
    const clampTeam = (tid: string): string => {
      const m = /^team_(\d+)$/i.exec(tid.trim());
      if (!m?.[1]) return "team_1";
      let n = Number.parseInt(m[1], 10);
      if (!Number.isFinite(n) || n < 1) n = 1;
      if (n > teams) n = teams;
      return `team_${n}`;
    };

    const docs = extracted.rosterRows.map((r) => ({
      leagueId: league._id,
      userId: league.commissionerId,
      teamId: clampTeam(r.teamId),
      externalPlayerId: r.externalPlayerId,
      playerName: r.playerName,
      playerTeam: r.playerTeam,
      positions: r.positions,
      price: r.price,
      rosterSlot: r.rosterSlot,
      isKeeper: r.isKeeper,
      keeperContract: "",
    }));

    if (docs.length > 0) {
      await RosterEntry.insertMany(docs);
    }

    const after = await statsFromMongoLeague(
      league._id,
      league.teams,
      fixtureStats.remainingBudgetsByFantasy,
    );
    after.leagueId = String(league._id);
    after.leagueName = league.name;
    after.createdAt = before.createdAt;

    // eslint-disable-next-line no-console -- operational verification dump
    console.info("\n── Mongo AFTER refresh ──\n", formatDemoLeagueStatsReport(after));

    expect(after.keeperCountsByFantasy).toEqual(fixtureStats.keeperCountsByFantasy);
    expect(after.minorsCountsByFantasy).toEqual(fixtureStats.minorsCountsByFantasy);
    expect(after.taxiCountsByFantasy).toEqual(fixtureStats.taxiCountsByFantasy);
    expect(after.activeAuctionSlotCount).toBe(0);
    expect(after.unresolvedSyntheticIds).toEqual(fixtureStats.unresolvedSyntheticIds);

    const refreshed = await League.findById(league._id).lean();
    expect(refreshed?.teamNames).toEqual([
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

    await mongoose.disconnect();
  });
});
