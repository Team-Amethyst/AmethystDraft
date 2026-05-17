/**
 * Hydrates AI Mock Draft UI state from bundled Engine checkpoint JSON (nested Activity #9
 * or flat valuation body). Shapes align with Draft {@link valuationIncomingSchema}.
 */

import type { Player } from "../types/player";
import type { AIRoster, AIPick } from "../utils/mockDraftAI";
import { buildSnakeOrder } from "../utils/mockDraftAI";
import type { DraftLogEntry, MockDraftState } from "./mockDraftState";
import { initialMockDraftState } from "./mockDraftState";
import { defaultTeamDisplayNameForIndex } from "./fantasyTeamNames";

type FixturePickRow = {
  player_id: string;
  name: string;
  position?: string;
  positions?: string[];
  team?: string;
  team_id: string;
  paid?: number;
  pick_number?: number;
  is_keeper?: boolean;
  roster_slot?: string;
};

type TeamSection = { team_id: string; players: FixturePickRow[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function rosterSlotsRecordFromFixture(rosterSlots: unknown): Record<string, number> {
  if (!rosterSlots) return {};
  if (Array.isArray(rosterSlots)) {
    const out: Record<string, number> = {};
    for (const row of rosterSlots) {
      if (!isRecord(row)) continue;
      const pos = row.position;
      const count = row.count;
      if (typeof pos !== "string" || typeof count !== "number") continue;
      out[pos] = count;
    }
    return out;
  }
  if (typeof rosterSlots === "object") {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(rosterSlots as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.floor(v);
    }
    return out;
  }
  return {};
}

function slotLabel(row: FixturePickRow): string {
  const rs = row.roster_slot?.trim();
  if (rs) return rs.replace(/\d+$/, "") || rs;
  return row.positions?.[0] ?? row.position ?? "UTIL";
}

function stubPlayer(row: FixturePickRow, catalog?: Player): Player {
  if (catalog) return catalog;
  const position = row.positions?.[0] ?? row.position ?? "UTIL";
  return {
    id: String(row.player_id).trim(),
    mlbId: Number.parseInt(String(row.player_id), 10) || 0,
    name: row.name,
    team: row.team ?? "",
    position,
    positions: row.positions?.length ? [...row.positions] : [position],
    age: 0,
    catalog_rank: 999,
    catalog_tier: 5,
    value: 0,
    headshot: "",
    outlook: "",
    stats: {},
    projection: {},
  };
}

/** Pad / trim display names so Mock Draft roster count matches fixture `num_teams`. */
export function alignTeamNamesForCheckpoint(
  leagueNames: readonly string[],
  numTeams: number,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < numTeams; i++) {
    const name = leagueNames[i]?.trim();
    out.push(
      name && name.length > 0
        ? name
        : defaultTeamDisplayNameForIndex(i, numTeams),
    );
  }
  return out;
}

function parseTeamIndex(teamId: string): number | null {
  const m = /^team_(\d+)$/.exec(teamId.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 ? n - 1 : null;
}

function mapTeamIdToRosterIndex(teamId: string, numTeams: number): number {
  const idx = parseTeamIndex(teamId);
  if (idx !== null && idx >= 0 && idx < numTeams) return idx;
  let h = 0;
  for (let i = 0; i < teamId.length; i++) {
    h = (h + teamId.charCodeAt(i) * (i + 1)) % numTeams;
  }
  return h;
}

export type CheckpointHydratePlan = {
  checkpointKey: string;
  rosterSlots: Record<string, number>;
  budget: number;
  teamNames: string[];
  mockDraftState: MockDraftState;
};

/**
 * Builds Mock Draft state after applying auction picks through N plus keeper rows from `pre_draft_rosters`.
 */
export function planMockDraftFromCheckpointJson(args: {
  checkpointKey: string;
  checkpointJson: unknown;
  leagueTeamNames: readonly string[];
  allPlayers: Player[];
}): CheckpointHydratePlan | { error: string } {
  const raw = args.checkpointJson;
  if (!isRecord(raw)) return { error: "Checkpoint JSON must be an object" };

  let draftRows: FixturePickRow[] = [];
  let keeperSections: TeamSection[] = [];
  let rosterSlotsUnknown: unknown;
  let totalBudget = 260;
  let numTeams = 12;

  if (raw.league != null && isRecord(raw.league) && Array.isArray(raw.draft_state)) {
    const league = raw.league as Record<string, unknown>;
    rosterSlotsUnknown = league.roster_slots;
    if (typeof league.total_budget === "number") totalBudget = league.total_budget;
    if (typeof league.num_teams === "number") numTeams = league.num_teams;
    draftRows = raw.draft_state as FixturePickRow[];
    const pre = raw.pre_draft_rosters;
    if (Array.isArray(pre)) keeperSections = pre as TeamSection[];
  } else if (Array.isArray(raw.drafted_players)) {
    rosterSlotsUnknown = raw.roster_slots;
    if (typeof raw.total_budget === "number") totalBudget = raw.total_budget;
    if (typeof raw.num_teams === "number") numTeams = raw.num_teams;
    draftRows = raw.drafted_players as FixturePickRow[];
    const pre = raw.pre_draft_rosters;
    if (Array.isArray(pre)) keeperSections = pre as TeamSection[];
    else if (isRecord(pre)) {
      keeperSections = Object.entries(pre).map(([team_id, players]) => ({
        team_id,
        players: players as FixturePickRow[],
      }));
    }
  } else {
    return {
      error:
        "Unsupported checkpoint shape — expected nested { league, draft_state } or flat { drafted_players }",
    };
  }

  if (numTeams < 2) return { error: "Checkpoint num_teams must be at least 2" };

  const rosterSlots = rosterSlotsRecordFromFixture(rosterSlotsUnknown);
  const slotSum = Object.values(rosterSlots).reduce((a, b) => a + b, 0);
  if (slotSum <= 0) return { error: "Checkpoint roster_slots missing or empty" };

  const teamNames = alignTeamNamesForCheckpoint(args.leagueTeamNames, numTeams);
  const catalogById = new Map(args.allPlayers.map((p) => [p.id, p]));

  const rosters: AIRoster[] = teamNames.map((name, i) => ({
    teamName: name,
    budget: totalBudget,
    spent: 0,
    picks: [],
    isUser: i === 0,
  }));

  const pushPick = (teamIdx: number, row: FixturePickRow, slot: string) => {
    const r = rosters[teamIdx];
    if (!r) return;
    const cat = catalogById.get(String(row.player_id).trim());
    const player = stubPlayer(row, cat);
    const price = typeof row.paid === "number" && row.paid >= 0 ? row.paid : 0;
    const pick: AIPick = { player, price, slot };
    r.picks.push(pick);
    r.spent += price;
  };

  for (const section of keeperSections) {
    const idx = mapTeamIdToRosterIndex(section.team_id, numTeams);
    for (const row of section.players ?? []) {
      pushPick(idx, row, slotLabel(row));
    }
  }

  const auctionSorted = [...draftRows].sort((a, b) => {
    const pa = a.pick_number ?? 0;
    const pb = b.pick_number ?? 0;
    return pa - pb;
  });

  const log: DraftLogEntry[] = [];
  let pickOrdinal = 0;
  for (const row of auctionSorted) {
    pickOrdinal += 1;
    const idx = mapTeamIdToRosterIndex(row.team_id, numTeams);
    const slot = slotLabel(row);
    pushPick(idx, row, slot);
    const cat = catalogById.get(String(row.player_id).trim());
    const player = stubPlayer(row, cat);
    log.push({
      pickNum: row.pick_number ?? pickOrdinal,
      player,
      teamName: teamNames[idx] ?? row.team_id,
      price: typeof row.paid === "number" ? row.paid : 0,
      slot,
    });
  }

  log.sort((a, b) => a.pickNum - b.pickNum);

  const draftedIds = new Set<string>();
  for (const r of rosters) {
    for (const p of r.picks) {
      draftedIds.add(String(p.player.id).trim());
    }
  }

  const undraftedPlayers = args.allPlayers.filter(
    (p) => !draftedIds.has(String(p.id).trim()),
  );

  const snakeOrder = buildSnakeOrder(teamNames.length, slotSum);
  const currentOrderIdx = Math.min(auctionSorted.length, snakeOrder.length);

  const mockDraftState: MockDraftState = {
    ...initialMockDraftState,
    phase: "nomination",
    checkpointHydration: {
      checkpointKey: args.checkpointKey,
      rosterSlots,
      budget: totalBudget,
      teamNames,
    },
    rosters,
    undraftedPlayers,
    snakeOrder,
    currentOrderIdx,
    nominatedPlayer: null,
    currentBid: 1,
    currentBidder: "",
    userBid: 2,
    log,
    suggestion: null,
    pendingAIBids: [],
    isRebidRound: false,
    message:
      auctionSorted.length === 0
        ? "Loaded pre-draft checkpoint — your nomination."
        : `Loaded checkpoint (${args.checkpointKey}) through ${auctionSorted.length} auction picks.`,
  };

  return {
    checkpointKey: args.checkpointKey,
    rosterSlots,
    budget: totalBudget,
    teamNames,
    mockDraftState,
  };
}
