import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { buildApp } from "./app";
import { mongoConnectionOptionsFromEnv } from "./lib/mongoConnectionOptions";
import RosterEntry from "./models/RosterEntry";
import League from "./models/League";
import User from "./models/User";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const mongoUri = process.env.MONGO_URI?.trim();
const shouldRun = Boolean(mongoUri && process.env.JWT_SECRET?.trim());

function rosterComparable(e: {
  externalPlayerId?: string;
  playerName?: string;
  playerTeam?: string;
  positions?: string[];
  price?: number;
  rosterSlot?: string;
  isKeeper?: boolean;
  keeperContract?: string;
  teamId?: string;
}) {
  return {
    externalPlayerId: e.externalPlayerId,
    playerName: e.playerName,
    playerTeam: e.playerTeam ?? "",
    positions: e.positions ?? [],
    price: e.price,
    rosterSlot: e.rosterSlot,
    isKeeper: Boolean(e.isKeeper),
    keeperContract: e.keeperContract ?? "",
    teamId: e.teamId,
  };
}

describe.skipIf(!shouldRun)("league season + keeper import (HTTP + Mongo)", () => {
  const app = buildApp();
  let openedMongoHere = false;
  let token: string;
  let userId: string;
  let oldLeagueId: string;
  let newLeagueId: string;
  const familyId = randomUUID();
  const seasonOld = 2189;
  const seasonNew = 2190;
  let oldRosterBaseline: ReturnType<typeof rosterComparable>[];

  beforeAll(async () => {
    if (!mongoUri) throw new Error("MONGO_URI missing");
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, mongoConnectionOptionsFromEnv());
      openedMongoHere = true;
    }

    const email = `season-e2e-${Date.now()}@local.test`;
    const reg = await request(app)
      .post("/api/auth/register")
      .send({
        displayName: "Season E2E",
        email,
        password: "secret12",
      })
      .expect(201);
    token = reg.body.token as string;
    userId = String(reg.body.user.id);

    const leagueRes = await request(app)
      .post("/api/leagues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: `E2E Season ${Date.now()}`,
        teams: 12,
        budget: 275,
        hitterBudgetPct: 72,
        rosterSlots: { C: 1, "1B": 1, SP: 2, BN: 1 },
        scoringFormat: "6x6",
        scoringCategories: [{ name: "HR", type: "batting" }],
        playerPool: "NL",
        posEligibilityThreshold: 18,
        teamNames: ["Alpha", "Beta"],
        seasonYear: seasonOld,
        leagueFamilyId: familyId,
      })
      .expect(201);

    oldLeagueId = leagueRes.body.id as string;
    expect(leagueRes.body.leagueFamilyId).toBe(familyId);
    expect(leagueRes.body.seasonYear).toBe(seasonOld);

    await request(app)
      .post(`/api/leagues/${oldLeagueId}/roster`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        externalPlayerId: `kpr-${Date.now()}`,
        playerName: "Keeper Star",
        playerTeam: "NYY",
        positions: ["1B", "CI"],
        price: 33,
        rosterSlot: "CI1",
        isKeeper: true,
        keeperContract: "Y2",
        teamId: "team_1",
      })
      .expect(201);

    await request(app)
      .post(`/api/leagues/${oldLeagueId}/roster`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        externalPlayerId: `drp-${Date.now()}`,
        playerName: "Drafted Only",
        playerTeam: "LAD",
        positions: ["SP"],
        price: 5,
        rosterSlot: "SP1",
        isKeeper: false,
        teamId: "team_2",
      })
      .expect(201);

    const oldRows = await RosterEntry.find({ leagueId: oldLeagueId }).sort({ externalPlayerId: 1 }).lean();
    oldRosterBaseline = oldRows.map((r) => rosterComparable(r));
    expect(oldRosterBaseline).toHaveLength(2);
  });

  afterAll(async () => {
    if (!shouldRun) return;
    try {
      if (oldLeagueId) await RosterEntry.deleteMany({ leagueId: oldLeagueId });
      if (newLeagueId) await RosterEntry.deleteMany({ leagueId: newLeagueId });
      if (oldLeagueId) await League.deleteOne({ _id: oldLeagueId });
      if (newLeagueId) await League.deleteOne({ _id: newLeagueId });
      if (userId) await User.deleteOne({ _id: userId });
    } finally {
      if (openedMongoHere && mongoose.connection.readyState !== 0) {
        await mongoose.connection.close(false);
      }
    }
  });

  it("start-new-season clones settings, links chain, leaves old roster untouched; new league has empty roster", async () => {
    const start = await request(app)
      .post(`/api/leagues/${oldLeagueId}/start-new-season`)
      .set("Authorization", `Bearer ${token}`)
      .send({ seasonYear: seasonNew })
      .expect(201);

    const newLeague = start.body;
    newLeagueId = newLeague.id as string;

    expect(newLeague.leagueFamilyId).toBe(familyId);
    expect(newLeague.seasonYear).toBe(seasonNew);
    expect(newLeague.previousSeasonLeagueId).toBe(oldLeagueId);

    expect(newLeague.budget).toBe(275);
    expect(newLeague.hitterBudgetPct).toBe(72);
    expect(newLeague.teams).toBe(12);
    expect(newLeague.scoringFormat).toBe("6x6");
    expect(newLeague.scoringCategories.map((c: { name: string; type: string }) => ({ name: c.name, type: c.type }))).toEqual([
      { name: "HR", type: "batting" },
    ]);
    expect(newLeague.playerPool).toBe("NL");
    expect(newLeague.posEligibilityThreshold).toBe(18);
    expect(newLeague.teamNames).toEqual(["Alpha", "Beta"]);
    expect(newLeague.rosterSlots).toEqual({ C: 1, "1B": 1, SP: 2, BN: 1 });
    expect(newLeague.memberIds.map(String)).toEqual([userId]);
    expect(newLeague.draftStatus).toBe("pre-draft");

    const newRoster = await request(app)
      .get(`/api/leagues/${newLeagueId}/roster`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(newRoster.body).toEqual([]);

    const oldRowsAfter = await RosterEntry.find({ leagueId: oldLeagueId }).sort({ externalPlayerId: 1 }).lean();
    expect(oldRowsAfter.map((r) => rosterComparable(r))).toEqual(oldRosterBaseline);
  });

  it("import-keepers copies only keepers with mapping; old rows unchanged", async () => {
    const oldSnapshot = await RosterEntry.find({ leagueId: oldLeagueId }).sort({ externalPlayerId: 1 }).lean();

    const imp = await request(app)
      .post(`/api/leagues/${newLeagueId}/import-keepers`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        fromLeagueId: oldLeagueId,
        teamMapping: { team_1: "team_mapped" },
      })
      .expect(201);

    expect(imp.body).toEqual({ imported: 1 });

    const oldAfter = await RosterEntry.find({ leagueId: oldLeagueId }).sort({ externalPlayerId: 1 }).lean();
    expect(oldAfter.map((r) => String(r._id))).toEqual(oldSnapshot.map((r) => String(r._id)));
    expect(oldAfter.map((r) => rosterComparable(r))).toEqual(oldSnapshot.map((r) => rosterComparable(r)));

    const newRows = await RosterEntry.find({ leagueId: newLeagueId }).lean();
    expect(newRows).toHaveLength(1);
    const k = newRows[0];
    expect(String(k.leagueId)).toBe(newLeagueId);
    expect(k.isKeeper).toBe(true);
    expect(k.externalPlayerId).toBe(oldRosterBaseline.find((x) => x.isKeeper)!.externalPlayerId);
    expect(k.playerName).toBe("Keeper Star");
    expect(k.playerTeam).toBe("NYY");
    expect(k.positions).toEqual(["1B", "CI"]);
    expect(k.price).toBe(33);
    expect(k.rosterSlot).toBe("CI1");
    expect(k.keeperContract).toBe("Y2");
    expect(k.teamId).toBe("team_mapped");
  });

  it("GET /api/leagues returns both seasons with season metadata", async () => {
    const res = await request(app).get("/api/leagues").set("Authorization", `Bearer ${token}`).expect(200);
    const ours = (res.body as Record<string, unknown>[]).filter(
      (l) => l.leagueFamilyId === familyId && (l.id === oldLeagueId || l.id === newLeagueId),
    );
    expect(ours).toHaveLength(2);
    const years = ours.map((l) => l.seasonYear).sort((a, b) => (a as number) - (b as number));
    expect(years).toEqual([seasonOld, seasonNew]);
    for (const row of ours) {
      expect(typeof row.leagueFamilyId).toBe("string");
      expect(typeof row.seasonYear).toBe("number");
    }
  });
});
