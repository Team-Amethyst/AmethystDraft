import mongoose from "mongoose";
import League from "../models/League";
import RosterEntry from "../models/RosterEntry";
import type { ILeague } from "../models/League";

/** Prod / acceptance Friendly League (true empty, 12-team). */
export const CANONICAL_FRIENDLY_LEAGUE_ID = "69adf94bf906d9524b83f2df";

export const CANONICAL_ORIGINAL_DEMO_LEAGUE_ID = "69eeeedfacc8a071bb2ddcf8";

export const CANONICAL_DEMO_KEEPER_PRE_DRAFT_ID = "6a088b6731b28f142d5f44e9";

export async function resolveOriginalDemoLeague(): Promise<ILeague | null> {
  const preferred = await League.findById(CANONICAL_ORIGINAL_DEMO_LEAGUE_ID).lean();
  if (preferred) return preferred as ILeague;
  return League.findOne({ name: /^original$/i }).lean() as Promise<ILeague | null>;
}

/**
 * Friendly League used in economic acceptance audits. Prefer the canonical id;
 * otherwise the newest zero-roster "Friendly League" (excluding Original).
 */
export async function resolveFriendlyLeagueForAudit(): Promise<ILeague> {
  const original = await resolveOriginalDemoLeague();
  const excludeId = original?._id;

  const preferred = await League.findById(CANONICAL_FRIENDLY_LEAGUE_ID).lean();
  if (preferred) return preferred as ILeague;

  const candidates = await League.find({
    name: "Friendly League",
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  })
    .sort({ updatedAt: -1 })
    .limit(15)
    .lean();

  for (const league of candidates) {
    const rosterCount = await RosterEntry.countDocuments({
      leagueId: league._id,
    });
    if (rosterCount === 0) return league as ILeague;
  }

  if (candidates[0]) return candidates[0] as ILeague;
  throw new Error("No Friendly League found for audit");
}

export async function resolveDemoKeeperPreDraftLeague(): Promise<ILeague | null> {
  const preferred = await League.findById(CANONICAL_DEMO_KEEPER_PRE_DRAFT_ID).lean();
  if (preferred) return preferred as ILeague;
  return League.findOne({ name: /\[Demo\].*pre\s*draft/i }).lean() as Promise<
    ILeague | null
  >;
}

export function isFriendlyLeagueNamePattern(pattern: RegExp): boolean {
  return /friendly/i.test(pattern.source);
}

export async function resolveLeagueForAudit(params: {
  leagueId?: string;
  namePattern?: RegExp;
}): Promise<ILeague> {
  if (params.leagueId) {
    const byId = await League.findById(params.leagueId).lean();
    if (!byId) throw new Error(`League not found: ${params.leagueId}`);
    return byId as ILeague;
  }
  if (params.namePattern && isFriendlyLeagueNamePattern(params.namePattern)) {
    return resolveFriendlyLeagueForAudit();
  }
  if (params.namePattern && /^original$/i.test(params.namePattern.source.trim())) {
    const orig = await resolveOriginalDemoLeague();
    if (orig) return orig;
  }
  const matches = await League.find(
    params.namePattern ? { name: params.namePattern } : {},
  )
    .sort({ updatedAt: -1 })
    .limit(5)
    .lean();
  if (matches.length === 0) {
    throw new Error(`No league matching ${params.namePattern?.source ?? "(any)"}`);
  }
  return matches[0] as ILeague;
}

export function friendlyLeagueObjectId(): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(CANONICAL_FRIENDLY_LEAGUE_ID);
}
