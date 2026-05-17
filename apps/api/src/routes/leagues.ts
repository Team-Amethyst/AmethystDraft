import { Router, RequestHandler, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import League, { ITaxiRosterEntry } from "../models/League";
import RosterEntry from "../models/RosterEntry";
import PlayerNote from "../models/PlayerNote";
import WatchlistEntry from "../models/WatchlistEntry";
import authMiddleware, { AuthRequest } from "../middleware/auth";
import { validate } from "../validation/validate";
import {
  createLeagueSchema,
  updateLeagueSchema,
  addRosterEntrySchema,
  updateTaxiDraftOrderSchema,
  updateTaxiRostersSchema,
  startNewSeasonSchema,
  importKeepersSchema,
  valuationIncomingSchema,
  createLeagueFromCheckpointSchema,
} from "../validation/schemas";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from "../lib/appError";
import {
  buildNewSeasonLeaguePayload,
  persistedLeagueFamilyId,
  resolveSeasonYear,
  nextSeasonYear,
  type LeaguePlainForSeasonClone,
} from "../lib/leagueSeason";
import { syncLeagueDraftStatus } from "../lib/draftStatus";
import { readCheckpointFixtureJson } from "../lib/engineCheckpointCatalog";
import { extractCheckpointLeagueAndRoster } from "../lib/leagueFromEngineCheckpoint";
import { inferMongoPositionsFromCheckpointPick } from "../lib/inferredCheckpointPositions";

const router: Router = Router();

router.use(authMiddleware as RequestHandler);

function singleRouteParam(raw: string | string[] | undefined): string {
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Invalid league id", 400, "INVALID_LEAGUE_ID");
  }
  return id;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serializeLeague(league: InstanceType<typeof League>) {
  const obj = league.toObject();
  const id = String(obj._id);
  const seasonYear = resolveSeasonYear(league);
  const leagueFamilyId = persistedLeagueFamilyId({
    _id: obj._id,
    leagueFamilyId: obj.leagueFamilyId,
  });
  const prev = obj.previousSeasonLeagueId;
  return {
    ...obj,
    id,
    commissionerId: String(obj.commissionerId),
    memberIds: (obj.memberIds ?? []).map(String),
    _id: undefined,
    __v: undefined,
    seasonYear,
    leagueFamilyId,
    previousSeasonLeagueId: prev ? String(prev) : undefined,
  };
}

// ─── POST /api/leagues/from-engine-checkpoint ──────────────────────────────────
// Demo / QA: persist League + RosterEntry rows from bundled Engine checkpoint JSON.

const createLeagueFromEngineCheckpoint: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body as {
      checkpoint_key: string;
      name?: string;
      seasonYear?: number;
    };

    const raw = readCheckpointFixtureJson(
      body.checkpoint_key as import("../lib/engineCheckpointCatalog").EngineCheckpointId,
    );
    let parsed;
    try {
      parsed = valuationIncomingSchema.parse(raw);
    } catch (e) {
      next(
        new ValidationError(
          "Checkpoint fixture failed validation",
          400,
          "CHECKPOINT_FIXTURE_INVALID",
          e instanceof Error ? { message: e.message } : undefined,
        ),
      );
      return;
    }

    const extracted = extractCheckpointLeagueAndRoster(parsed);

    const nowYear = new Date().getFullYear();
    const minYear = nowYear - 3;
    const y = body.seasonYear ?? nowYear;
    if (y > nowYear || y < minYear) {
      throw new ValidationError(
        y > nowYear
          ? "Season year cannot be in the future"
          : `Season year cannot be older than ${minYear}`,
        400,
        "INVALID_SEASON_YEAR",
      );
    }

    const leagueName =
      typeof body.name === "string" && body.name.trim().length > 0
        ? body.name.trim()
        : `[Demo] ${body.checkpoint_key.replace(/_/g, " ")}`;

    const league = await League.create({
      name: leagueName,
      commissionerId: req.user!._id,
      memberIds: [req.user!._id],
      seasonYear: y,
      teams: extracted.teams,
      budget: extracted.budget,
      hitterBudgetPct: extracted.hitterBudgetPct ?? 70,
      rosterSlots: extracted.rosterSlots,
      scoringFormat: extracted.scoringFormat ?? "5x5",
      scoringCategories: extracted.scoringCategories,
      playerPool: extracted.playerPool,
      teamNames: extracted.teamNames,
      posEligibilityThreshold: extracted.posEligibilityThreshold ?? 20,
      leagueFamilyId: randomUUID(),
    });

    const commissionerId = req.user!._id;
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
      userId: commissionerId,
      teamId: clampTeam(r.teamId),
      externalPlayerId: r.externalPlayerId,
      playerName: r.playerName,
      playerTeam: r.playerTeam,
      positions: inferMongoPositionsFromCheckpointPick({
        positions: r.positions,
        position: undefined,
        roster_slot: r.rosterSlot,
      }),
      price: r.price,
      rosterSlot: r.rosterSlot,
      isKeeper: r.isKeeper,
      keeperContract: "",
    }));

    if (docs.length > 0) {
      await RosterEntry.insertMany(docs);
    }
    await syncLeagueDraftStatus(league._id);

    const refreshed = await League.findById(league._id);
    if (!refreshed) {
      throw new NotFoundError(
        "League not found after create",
        500,
        "LEAGUE_CREATE_FAILED",
      );
    }
    res.status(201).json(serializeLeague(refreshed));
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/leagues ─────────────────────────────────────────────────────────

const createLeague: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      name,
      seasonYear,
      teams,
      budget,
      hitterBudgetPct,
      rosterSlots,
      scoringFormat,
      scoringCategories,
      playerPool,
      draftDate,
      teamNames,
      posEligibilityThreshold,
      leagueFamilyId,
    } = req.body;

    const nowYear = new Date().getFullYear();
    const minYear = nowYear - 3;
    if (seasonYear !== undefined) {
      if (seasonYear > nowYear) {
        throw new ValidationError(
          "Season year cannot be in the future",
          400,
          "INVALID_SEASON_YEAR",
        );
      }
      if (seasonYear < minYear) {
        throw new ValidationError(
          `Season year cannot be older than ${minYear}`,
          400,
          "INVALID_SEASON_YEAR",
        );
      }
    }

    const league = await League.create({
      name: name.trim(),
      commissionerId: req.user!._id,
      memberIds: [req.user!._id],
      seasonYear: seasonYear ?? new Date().getFullYear(),
      teams: teams ?? 12,
      budget: budget ?? 260,
      hitterBudgetPct: hitterBudgetPct ?? 70,
      rosterSlots: rosterSlots ?? undefined,
      scoringFormat: scoringFormat ?? "5x5",
      scoringCategories: scoringCategories ?? [],
      playerPool: playerPool ?? "Mixed",
      draftDate: draftDate ? new Date(draftDate) : undefined,
      teamNames: teamNames ?? [],
      posEligibilityThreshold: posEligibilityThreshold ?? 20,
      leagueFamilyId: leagueFamilyId?.trim() || randomUUID(),
    });

    res.status(201).json(serializeLeague(league));
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/leagues ──────────────────────────────────────────────────────────

const getMyLeagues: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const q: Record<string, unknown> = { memberIds: req.user!._id };
    const seasonYearParam = req.query.seasonYear;
    if (seasonYearParam !== undefined) {
      const parsed = Number(seasonYearParam);
      if (!Number.isNaN(parsed)) q.seasonYear = parsed;
    }
    const leagues = await League.find(q as any).sort([
      ["leagueFamilyId", 1],
      ["seasonYear", -1],
      ["name", 1],
    ]);
    res.json(leagues.map(serializeLeague));
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/leagues/:id ──────────────────────────────────────────────────────

const getLeague: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const league = await League.findOne({
      _id: req.params.id,
      memberIds: req.user!._id,
    });

    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }

    res.json(serializeLeague(league));
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/leagues/:id ───────────────────────────────────────────────────

const updateLeague: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const league = await League.findOne({
      _id: req.params.id,
      commissionerId: req.user!._id,
    });

    if (!league) {
      throw new NotFoundError("League not found or not authorized", 404, "LEAGUE_NOT_FOUND_OR_UNAUTHORIZED");
    }

    const {
      name,
      teams,
      budget,
      hitterBudgetPct,
      rosterSlots,
      scoringFormat,
      scoringCategories,
      playerPool,
      draftDate,
      teamNames,
      posEligibilityThreshold,
    } = req.body;

    if (name !== undefined) league.name = String(name).trim();
    if (teams !== undefined) league.teams = teams;
    if (budget !== undefined) league.budget = budget;
    if (hitterBudgetPct !== undefined) league.hitterBudgetPct = hitterBudgetPct;
    if (rosterSlots !== undefined) league.rosterSlots = rosterSlots;
    if (scoringFormat !== undefined) league.scoringFormat = scoringFormat;
    if (scoringCategories !== undefined)
      league.scoringCategories = scoringCategories;
    if (playerPool !== undefined) league.playerPool = playerPool;
    if (draftDate !== undefined)
      league.draftDate = draftDate ? new Date(draftDate) : undefined;
    if (teamNames !== undefined) league.teamNames = teamNames;
    if (posEligibilityThreshold !== undefined)
      league.posEligibilityThreshold = posEligibilityThreshold;

    await league.save();
    res.json(serializeLeague(league));
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/leagues/:id ─────────────────────────────────────────────────
// Commissioner only. Removes roster, notes, watchlist for this league; clears
// previousSeasonLeagueId pointers from other league docs.

const deleteLeague: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const id = singleRouteParam(req.params.id);
    const league = await League.findOne({
      _id: id,
      commissionerId: req.user!._id,
    });
    if (!league) {
      throw new NotFoundError(
        "League not found or not authorized",
        404,
        "LEAGUE_NOT_FOUND_OR_UNAUTHORIZED",
      );
    }
    const leagueObjectId = league._id;
    await Promise.all([
      RosterEntry.deleteMany({ leagueId: leagueObjectId }),
      PlayerNote.deleteMany({ leagueId: leagueObjectId }),
      WatchlistEntry.deleteMany({ leagueId: leagueObjectId }),
      League.updateMany(
        { previousSeasonLeagueId: leagueObjectId },
        { $unset: { previousSeasonLeagueId: 1 } },
      ),
    ]);
    await League.deleteOne({ _id: leagueObjectId });
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/leagues/:id/roster ──────────────────────────────────────────────

const getRoster: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const league = await League.findOne({
      _id: req.params.id,
      memberIds: req.user!._id,
    });
    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }
    const entries = await RosterEntry.find({ leagueId: req.params.id }).sort({
      rosterSlot: 1,
    });
    res.json(entries);
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/leagues/:id/roster ─────────────────────────────────────────────

const addRosterEntry: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const league = await League.findOne({
      _id: req.params.id,
      memberIds: req.user!._id,
    });
    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }
    const {
      externalPlayerId,
      playerName,
      playerTeam,
      positions,
      price,
      rosterSlot,
      userId,
      teamId: bodyTeamId,
      isKeeper,
      keeperContract,
    } = req.body;
    const memberIds = league.memberIds.map(String);
    const requesterId = String(req.user!._id);
    const isCommissioner = String(league.commissionerId) === requesterId;
    if (userId && userId !== requesterId && !isCommissioner) {
      throw new ForbiddenError("Only the commissioner can add entries for other teams", 403, "FORBIDDEN_TEAM_WRITE");
    }
    const resolvedUserId =
      userId && isCommissioner ? String(userId) : requesterId;
    const teamIndex = memberIds.indexOf(resolvedUserId);
    // Commissioner may pass teamId explicitly for unjoined team slots
    const teamId =
      bodyTeamId && isCommissioner
        ? String(bodyTeamId)
        : teamIndex >= 0
          ? `team_${teamIndex + 1}`
          : `team_1`;
    const entry = await RosterEntry.create({
      leagueId: String(req.params.id),
      userId: resolvedUserId,
      teamId,
      externalPlayerId,
      playerName,
      playerTeam: playerTeam ?? "",
      positions: positions ?? [],
      price,
      rosterSlot,
      isKeeper: isKeeper ?? false,
      keeperContract:
        typeof keeperContract === "string" ? keeperContract.trim() : "",
    });
    await syncLeagueDraftStatus(league._id);
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/leagues/:id/roster/:entryId ──────────────────────────────────

const removeRosterEntry: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const league = await League.findOne({
      _id: req.params.id,
      memberIds: req.user!._id,
    });
    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }
    const entry = await RosterEntry.findOne({
      _id: req.params.entryId,
      leagueId: req.params.id,
    });
    if (!entry) {
      throw new NotFoundError("Entry not found", 404, "ENTRY_NOT_FOUND");
    }
    const isCommissioner =
      String(league.commissionerId) === String(req.user!._id);
    if (!isCommissioner && String(entry.userId) !== String(req.user!._id)) {
      throw new ForbiddenError("Not authorized to remove this entry", 403, "FORBIDDEN_TEAM_WRITE");
    }
    await entry.deleteOne();
    await syncLeagueDraftStatus(league._id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/leagues/:id/roster/:entryId ──────────────────────────────────

const updateRosterEntry: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Must be a league member
    const league = await League.findOne({
      _id: req.params.id,
      memberIds: req.user!._id,
    });
    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }
    const isCommissioner =
      String(league.commissionerId) === String(req.user!._id);

    // Load the entry and verify ownership
    const existingEntry = await RosterEntry.findOne({
      _id: req.params.entryId,
      leagueId: req.params.id,
    }).lean();
    if (!existingEntry) {
      throw new NotFoundError("Entry not found", 404, "ENTRY_NOT_FOUND");
    }
    if (
      !isCommissioner &&
      String(existingEntry.userId) !== String(req.user!._id)
    ) {
      throw new ForbiddenError("Not authorized to update this entry", 403, "FORBIDDEN_TEAM_WRITE");
    }

    const { price, rosterSlot, teamId, keeperContract } = req.body as {
      price?: number;
      rosterSlot?: string;
      teamId?: string;
      keeperContract?: string;
    };

    // Only the commissioner can reassign an entry to a different team
    if (teamId !== undefined && !isCommissioner) {
      throw new ForbiddenError("Only the commissioner can reassign entries", 403, "FORBIDDEN_TEAM_WRITE");
    }

    const update: Record<string, unknown> = {};
    if (price !== undefined) update.price = price;
    if (rosterSlot !== undefined) update.rosterSlot = rosterSlot;
    if (teamId !== undefined) {
      const teamIndex = parseInt(teamId.replace("team_", ""), 10) - 1;
      if (isNaN(teamIndex) || teamIndex < 0) {
        throw new ValidationError("Invalid teamId", 400, "INVALID_TEAM_ID");
      }
      update.teamId = teamId;
      // Also update userId if that team slot has a joined member
      const newUserId = league.memberIds[teamIndex];
      if (newUserId) update.userId = newUserId;
    }
    if (keeperContract !== undefined) {
      update.keeperContract = String(keeperContract).trim();
    }
    const entry = await RosterEntry.findOneAndUpdate(
      { _id: req.params.entryId, leagueId: req.params.id },
      { $set: update },
      { new: true },
    );
    if (!entry) {
      throw new NotFoundError("Entry not found", 404, "ENTRY_NOT_FOUND");
    }
    await syncLeagueDraftStatus(league._id);
    res.json(entry);
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/leagues/:leagueId/notes ─────────────────────────────────────────

const getNotes: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const notes = await PlayerNote.find({
      leagueId: req.params.id,
      userId: req.user!._id,
    });
    const map: Record<string, string> = {};
    for (const n of notes) {
      map[n.externalPlayerId] = n.content;
    }
    res.json(map);
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/leagues/:leagueId/notes/:playerId ────────────────────────────────

const upsertNote: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { content } = req.body as { content: string };
    const note = await PlayerNote.findOneAndUpdate(
      {
        leagueId: req.params.id,
        userId: req.user!._id,
        externalPlayerId: req.params.playerId,
      },
      { content: content ?? "" },
      { upsert: true, new: true },
    );
    res.json({ content: note.content });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/leagues/:id/watchlist ───────────────────────────────────────────

const getWatchlist: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const entries = await WatchlistEntry.find({
      leagueId: req.params.id,
      userId: req.user!._id,
    }).sort({ createdAt: 1 });
    res.json(
      entries.map((e) => ({
        id: e.externalPlayerId,
        name: e.playerName,
        team: e.playerTeam,
        position: e.playerPosition,
        positions: e.playerPositions,
        catalog_rank: e.adp,
        catalog_tier: e.tier,
        value: e.value,
        baseline_value: e.baselineValue,
        auction_value: e.adjustedValue,
        recommended_bid: e.recommendedBid,
        team_value: e.teamAdjustedValue,
      })),
    );
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/leagues/:id/watchlist/:playerId ─────────────────────────────────

const upsertWatchlistEntry: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      name,
      team,
      position,
      positions,
      catalog_rank,
      catalog_tier,
      adp,
      tier,
      value,
      baseline_value,
      auction_value,
      recommended_bid,
      team_value,
    } = req.body as {
      name: string;
      team?: string;
      position?: string;
      positions?: string[];
      catalog_rank?: number;
      catalog_tier?: number;
      adp?: number;
      value?: number;
      tier?: number;
      baseline_value?: number;
      auction_value?: number;
      recommended_bid?: number;
      team_value?: number;
    };
    await WatchlistEntry.findOneAndUpdate(
      {
        leagueId: req.params.id,
        userId: req.user!._id,
        externalPlayerId: req.params.playerId,
      },
      {
        playerName: name,
        playerTeam: team ?? "",
        playerPosition: position ?? "",
        playerPositions: positions ?? [],
        adp: catalog_rank ?? adp ?? 0,
        value: value ?? 0,
        tier: catalog_tier ?? tier ?? 5,
        baselineValue: baseline_value,
        adjustedValue: auction_value,
        recommendedBid: recommended_bid,
        teamAdjustedValue: team_value,
      },
      { upsert: true, new: true },
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/leagues/:id/watchlist/:playerId ──────────────────────────────

const deleteWatchlistEntry: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await WatchlistEntry.findOneAndDelete({
      leagueId: req.params.id,
      userId: req.user!._id,
      externalPlayerId: req.params.playerId,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/leagues/:id/taxi-draft-order ────────────────────────────────────

const updateTaxiDraftOrder: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const league = await League.findOne({
      _id: req.params.id,
      commissionerId: req.user!._id,
    });

    if (!league) {
      throw new NotFoundError("League not found or not authorized", 404, "LEAGUE_NOT_FOUND_OR_UNAUTHORIZED");
    }

    const { taxiDraftOrder } = req.body as { taxiDraftOrder: string[] };

    if (!Array.isArray(taxiDraftOrder)) {
      throw new ValidationError("taxiDraftOrder must be an array", 400, "INVALID_TAXI_DRAFT_ORDER");
    }

    league.taxiDraftOrder = taxiDraftOrder;
    await league.save();
    res.json(serializeLeague(league));
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/leagues/:id/taxi-rosters ─────────────────────────────────────────

const updateTaxiRosters: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const league = await League.findOne({
      _id: req.params.id,
      memberIds: req.user!._id,
    });

    if (!league) {
      throw new NotFoundError("League not found", 404, "LEAGUE_NOT_FOUND");
    }

    const { taxiRosters } = req.body as { taxiRosters: Record<string, ITaxiRosterEntry[]> };

    if (typeof taxiRosters !== "object" || taxiRosters === null) {
      throw new ValidationError("taxiRosters must be an object", 400, "INVALID_TAXI_ROSTERS");
    }

    league.taxiRosters = taxiRosters;
    await league.save();
    res.json(serializeLeague(league));
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/leagues/:id/start-new-season ────────────────────────────────────

const startNewSeason: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const leagueId = singleRouteParam(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(leagueId)) {
      throw new ValidationError("Invalid league id", 400, "INVALID_LEAGUE_ID");
    }

    const src = await League.findOne({
      _id: leagueId,
      commissionerId: req.user!._id,
    });

    if (!src) {
      throw new NotFoundError("League not found or not authorized", 404, "LEAGUE_NOT_FOUND_OR_UNAUTHORIZED");
    }

    const { seasonYear: requestedYear } = req.body as { seasonYear?: number };
    const baseYear = resolveSeasonYear(src);
    const nextYear = nextSeasonYear(src, requestedYear);

    if (nextYear <= baseYear) {
      throw new ConflictError(
        "New season year must be greater than the league’s current season year",
        409,
        "INVALID_SEASON_YEAR",
      );
    }

    const familyId = persistedLeagueFamilyId(src);
    const dup = await League.findOne({ leagueFamilyId: familyId, seasonYear: nextYear });
    if (dup) {
      throw new ConflictError(
        `A league already exists for season ${nextYear} in this league family`,
        409,
        "SEASON_EXISTS",
      );
    }

    const plain = { ...src.toObject(), _id: src._id } as LeaguePlainForSeasonClone;
    const payload = buildNewSeasonLeaguePayload(plain, nextYear, src._id);
    const created = await League.create(payload);
    res.status(201).json(serializeLeague(created));
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/leagues/:id/import-keepers ─────────────────────────────────────

const importKeepers: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const newLeagueId = singleRouteParam(req.params.id);
    const { fromLeagueId, teamMapping } = req.body as {
      fromLeagueId: string;
      teamMapping?: Record<string, string>;
    };

    if (!mongoose.Types.ObjectId.isValid(newLeagueId) || !mongoose.Types.ObjectId.isValid(fromLeagueId)) {
      throw new ValidationError("Invalid league id", 400, "INVALID_LEAGUE_ID");
    }

    if (fromLeagueId === newLeagueId) {
      throw new ValidationError("fromLeagueId must differ from the target league", 400, "INVALID_IMPORT");
    }

    const newLeague = await League.findOne({
      _id: newLeagueId,
      commissionerId: req.user!._id,
    });

    if (!newLeague) {
      throw new NotFoundError("League not found or not authorized", 404, "LEAGUE_NOT_FOUND_OR_UNAUTHORIZED");
    }

    const fromLeague = await League.findById(fromLeagueId);
    if (!fromLeague) {
      throw new NotFoundError("Source league not found", 404, "SOURCE_LEAGUE_NOT_FOUND");
    }

    const uid = req.user!._id;
    const fromMembers = fromLeague.memberIds ?? [];
    const isFromMember = fromMembers.some((m) => m.equals(uid));
    if (!isFromMember) {
      throw new ForbiddenError(
        "You must be a member of the source league to import keepers",
        403,
        "NOT_SOURCE_MEMBER",
      );
    }

    if (persistedLeagueFamilyId(newLeague) !== persistedLeagueFamilyId(fromLeague)) {
      throw new ValidationError("Leagues must share the same leagueFamilyId", 400, "FAMILY_MISMATCH");
    }

    const keepers = await RosterEntry.find({
      leagueId: fromLeague._id,
      isKeeper: true,
    });

    const map = teamMapping ?? {};
    const docs = keepers.map((e) => ({
      leagueId: newLeague._id,
      userId: e.userId,
      teamId: map[e.teamId] ?? e.teamId,
      externalPlayerId: e.externalPlayerId,
      playerName: e.playerName,
      playerTeam: e.playerTeam,
      positions: [...e.positions],
      price: e.price,
      rosterSlot: e.rosterSlot,
      isKeeper: e.isKeeper,
      keeperContract: e.keeperContract,
      acquiredAt: e.acquiredAt,
    }));

    if (docs.length > 0) {
      await RosterEntry.insertMany(docs);
    }

    await syncLeagueDraftStatus(newLeague._id);

    res.status(201).json({ imported: docs.length });
  } catch (err) {
    next(err);
  }
};

// ─── Route registration ────────────────────────────────────────────────────────

router.post(
  "/from-engine-checkpoint",
  validate(createLeagueFromCheckpointSchema),
  createLeagueFromEngineCheckpoint,
);
router.post("/", validate(createLeagueSchema), createLeague);
router.get("/", getMyLeagues);
router.post("/:id/start-new-season", validate(startNewSeasonSchema), startNewSeason);
router.post("/:id/import-keepers", validate(importKeepersSchema), importKeepers);
router.get("/:id", getLeague);
router.patch("/:id", validate(updateLeagueSchema), updateLeague);
router.delete("/:id", deleteLeague);
router.get("/:id/roster", getRoster);
router.post("/:id/roster", validate(addRosterEntrySchema), addRosterEntry);
router.patch("/:id/roster/:entryId", updateRosterEntry);
router.delete("/:id/roster/:entryId", removeRosterEntry);
router.get("/:id/notes", getNotes);
router.put("/:id/notes/:playerId", upsertNote);
router.get("/:id/watchlist", getWatchlist);
router.put("/:id/watchlist/:playerId", upsertWatchlistEntry);
router.delete("/:id/watchlist/:playerId", deleteWatchlistEntry);

router.put("/:id/taxi-draft-order", validate(updateTaxiDraftOrderSchema), updateTaxiDraftOrder);
router.put("/:id/taxi-rosters", validate(updateTaxiRostersSchema), updateTaxiRosters);

export default router;
