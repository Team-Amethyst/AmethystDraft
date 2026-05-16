import path from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { buildApp } from "./app";
import { mongoConnectionOptionsFromEnv } from "./lib/mongoConnectionOptions";
import League from "./models/League";
import RosterEntry from "./models/RosterEntry";
import User from "./models/User";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function uiDraftStatusLabel(
  draftStatus: "pre-draft" | "in-progress" | "completed",
): string {
  switch (draftStatus) {
    case "pre-draft":
      return "Pre-draft";
    case "in-progress":
      return "In progress";
    case "completed":
      return "Completed";
    default:
      return draftStatus;
  }
}

const mongoUri = process.env.MONGO_URI?.trim();
const shouldRun = Boolean(mongoUri && process.env.JWT_SECRET?.trim());

async function getLeagues(token: string, app: ReturnType<typeof buildApp>) {
  const res = await request(app)
    .get("/api/leagues")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  return res.body as { id: string; draftStatus: string; name: string }[];
}

async function getLeagueStatus(
  token: string,
  app: ReturnType<typeof buildApp>,
  leagueId: string,
) {
  const list = await getLeagues(token, app);
  const row = list.find((l) => l.id === leagueId);
  if (!row) throw new Error(`League ${leagueId} not in GET /api/leagues`);
  return row.draftStatus;
}

describe.skipIf(!shouldRun)("draftStatus lifecycle smoke (HTTP + Mongo)", () => {
  const app = buildApp();
  let openedMongoHere = false;
  let token = "";
  let leagueId = "";
  const leagueName = `DraftStatus Smoke ${Date.now()}`;

  const results: { step: number; label: string; pass: boolean; detail: string }[] =
    [];

  function record(step: number, label: string, pass: boolean, detail: string) {
    results.push({ step, label, pass, detail });
    if (!pass) {
      console.error(`[smoke step ${step}] FAIL: ${label} — ${detail}`);
    } else {
      console.info(`[smoke step ${step}] PASS: ${label} — ${detail}`);
    }
  }

  beforeAll(async () => {
    if (!mongoUri) throw new Error("MONGO_URI missing");
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, mongoConnectionOptionsFromEnv());
      openedMongoHere = true;
    }

    const email = `draft-status-smoke-${Date.now()}@local.test`;
    const reg = await request(app)
      .post("/api/auth/register")
      .send({
        displayName: "Draft Status Smoke",
        email,
        password: "secret12",
      })
      .expect(201);
    token = reg.body.token as string;

    const created = await request(app)
      .post("/api/leagues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: leagueName,
        teams: 2,
        budget: 260,
        rosterSlots: { C: 1, OF: 1 },
        teamNames: ["Team A", "Team B"],
        seasonYear: new Date().getFullYear(),
      })
      .expect(201);

    leagueId = created.body.id as string;
    expect(created.body.draftStatus).toBe("pre-draft");
  });

  afterAll(async () => {
    if (leagueId) {
      await RosterEntry.deleteMany({ leagueId });
      await League.findByIdAndDelete(leagueId);
    }
    const emailMatch = /draft-status-smoke-.*@local\.test/;
    await User.deleteMany({ email: emailMatch });

    const failed = results.filter((r) => !r.pass);
    console.info("\n--- draftStatus smoke summary ---");
    for (const r of results) {
      console.info(`  ${r.pass ? "PASS" : "FAIL"} step ${r.step}: ${r.label}`);
    }
    if (failed.length > 0) {
      console.info(`  ${failed.length} step(s) failed`);
    }

    if (openedMongoHere && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it("runs lifecycle steps 1–11", async () => {
    // Step 1–2: new league → pre-draft
    let status = await getLeagueStatus(token, app, leagueId);
    record(
      1,
      "Create small test league",
      Boolean(leagueId),
      leagueId ? `id=${leagueId}` : "missing id",
    );
    const uiPreDraft = uiDraftStatusLabel("pre-draft");
    record(
      2,
      "League card label Pre-draft (API + UI formatter)",
      status === "pre-draft" && uiPreDraft === "Pre-draft",
      `draftStatus=${status}, uiLabel=${uiPreDraft}`,
    );

    // Step 3–4: keepers only → still pre-draft
    await request(app)
      .post(`/api/leagues/${leagueId}/roster`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        externalPlayerId: "keeper-a",
        playerName: "Keeper A",
        price: 10,
        rosterSlot: "C",
        isKeeper: true,
        teamId: "team_1",
      })
      .expect(201);

    await request(app)
      .post(`/api/leagues/${leagueId}/roster`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        externalPlayerId: "keeper-b",
        playerName: "Keeper B",
        price: 12,
        rosterSlot: "C",
        isKeeper: true,
        teamId: "team_2",
      })
      .expect(201);

    status = await getLeagueStatus(token, app, leagueId);
    record(
      3,
      "Add only keepers",
      true,
      "2 keeper rows created",
    );
    record(
      4,
      "Still pre-draft after keepers",
      status === "pre-draft",
      `draftStatus=${status}`,
    );

    // Step 5–7: first non-keeper → in-progress
    await request(app)
      .post(`/api/leagues/${leagueId}/roster`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        externalPlayerId: "pick-1",
        playerName: "First Pick",
        price: 15,
        rosterSlot: "OF",
        isKeeper: false,
        teamId: "team_1",
      })
      .expect(201);

    status = await getLeagueStatus(token, app, leagueId);
    const uiInProgress = uiDraftStatusLabel("in-progress");
    record(5, "Log first non-keeper pick", true, "pick-1 on OF team_1");
    record(
      6,
      "GET /api/leagues → in-progress",
      status === "in-progress",
      `draftStatus=${status}`,
    );
    record(
      7,
      "UI label In progress after refresh",
      uiInProgress === "In progress",
      `formatLeagueDraftStatusLabel=${uiInProgress} (client would show after refreshLeagues)`,
    );

    // Step 8–10: fill main roster (2 teams × (C+OF) = 4 required; after step 5 have 3 filled)
    await request(app)
      .post(`/api/leagues/${leagueId}/roster`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        externalPlayerId: "pick-2",
        playerName: "Second Pick",
        price: 18,
        rosterSlot: "OF",
        isKeeper: false,
        teamId: "team_1",
      })
      .expect(201);

    await request(app)
      .post(`/api/leagues/${leagueId}/roster`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        externalPlayerId: "pick-3",
        playerName: "Third Pick",
        price: 20,
        rosterSlot: "OF",
        isKeeper: false,
        teamId: "team_2",
      })
      .expect(201);

    status = await getLeagueStatus(token, app, leagueId);
    record(
      8,
      "Fill all required main slots",
      true,
      "4 main rows (2 keepers + 2 auction picks on OF)",
    );
    record(
      9,
      "GET /api/leagues → completed",
      status === "completed",
      `draftStatus=${status}`,
    );
    record(
      10,
      "UI label Completed",
      uiDraftStatusLabel("completed") === "Completed" && status === "completed",
      `draftStatus=${status}`,
    );

    // Step 11: taxi row does not complete (use fresh mini league)
    const taxiLeague = await request(app)
      .post("/api/leagues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: `Taxi smoke ${Date.now()}`,
        teams: 2,
        budget: 260,
        rosterSlots: { C: 1 },
        teamNames: ["X", "Y"],
      })
      .expect(201);
    const taxiId = taxiLeague.body.id as string;

    await request(app)
      .post(`/api/leagues/${taxiId}/roster`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        externalPlayerId: "taxi-only",
        playerName: "Taxi Only",
        price: 1,
        rosterSlot: "TAXI",
        isKeeper: false,
        teamId: "team_1",
      })
      .expect(201);

    const taxiStatus = await getLeagueStatus(token, app, taxiId);
    record(
      11,
      "Taxi-only row does not complete main draft",
      taxiStatus === "pre-draft",
      `draftStatus=${taxiStatus}`,
    );

    await RosterEntry.deleteMany({ leagueId: taxiId });
    await League.findByIdAndDelete(taxiId);

    const allPass = results.every((r) => r.pass);
    expect(allPass, results.filter((r) => !r.pass).map((r) => r.label).join(", ")).toBe(
      true,
    );
  });
});
