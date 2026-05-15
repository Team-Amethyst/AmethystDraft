import mongoose from "mongoose";
import type { ILeague } from "../models/League";

/** Effective season year for API responses (legacy rows use `createdAt` year). */
export function resolveSeasonYear(league: {
  seasonYear?: number;
  createdAt?: Date;
}): number {
  if (typeof league.seasonYear === "number" && Number.isFinite(league.seasonYear)) {
    return Math.floor(league.seasonYear);
  }
  const d = league.createdAt instanceof Date ? league.createdAt : new Date();
  return d.getFullYear();
}

/** Effective family id stored in DB or implied for legacy leagues (`_id` string). */
export function persistedLeagueFamilyId(league: {
  _id: mongoose.Types.ObjectId;
  leagueFamilyId?: string;
}): string {
  const raw = typeof league.leagueFamilyId === "string" ? league.leagueFamilyId.trim() : "";
  return raw || String(league._id);
}

export function nextSeasonYear(
  league: { seasonYear?: number; createdAt?: Date },
  requested?: number,
): number {
  if (typeof requested === "number" && Number.isFinite(requested)) {
    return Math.floor(requested);
  }
  return resolveSeasonYear(league) + 1;
}

export type LeaguePlainForSeasonClone = Pick<
  ILeague,
  | "name"
  | "commissionerId"
  | "memberIds"
  | "budget"
  | "hitterBudgetPct"
  | "teams"
  | "scoringFormat"
  | "scoringCategories"
  | "rosterSlots"
  | "playerPool"
  | "posEligibilityThreshold"
  | "teamNames"
> & {
  _id: mongoose.Types.ObjectId;
  leagueFamilyId?: string;
  isPublic?: boolean;
};

/** Fields copied into a new season `League` row (no roster / draft progress). */
export function buildNewSeasonLeaguePayload(
  src: LeaguePlainForSeasonClone,
  nextYear: number,
  previousSeasonLeagueId: mongoose.Types.ObjectId,
) {
  const familyId = persistedLeagueFamilyId(src);
  return {
    name: src.name,
    commissionerId: src.commissionerId,
    memberIds: [...(src.memberIds ?? [])],
    budget: src.budget,
    hitterBudgetPct: src.hitterBudgetPct,
    teams: src.teams,
    rosterSlots: { ...(src.rosterSlots ?? {}) },
    scoringFormat: src.scoringFormat,
    scoringCategories: (src.scoringCategories ?? []).map((c) => ({ ...c })),
    playerPool: src.playerPool,
    posEligibilityThreshold: src.posEligibilityThreshold,
    teamNames: [...(src.teamNames ?? [])],
    seasonYear: nextYear,
    leagueFamilyId: familyId,
    previousSeasonLeagueId,
    draftStatus: "pre-draft",
    draftDate: undefined,
    taxiRosters: {},
    taxiDraftOrder: [],
  };
}
