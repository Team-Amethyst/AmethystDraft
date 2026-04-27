/**
 * useMockDraft
 *
 * Manages all state for the AI Mock Draft feature.
 * Handles: snake order, AI turns, bidding rounds, roster tracking,
 * user confirmations, draft log, and localStorage persistence per league.
 *
 * Bidding flow:
 *   nomination → bidding (AI teams bid one at a time with delays)
 *              → when all AI pass, show user-confirm
 *              → user can "keep bidding" (re-queues all AI to respond)
 *              → or "done" → sold → next nomination
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { Player } from "../types/player";
import {
  type AIRoster,
  type AIPick,
  aiMaxBid,
  aiNominate,
  suggestNomination,
  buildSnakeOrder,
  openSlots,
} from "../utils/mockDraftAI";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DraftLogEntry {
  pickNum: number;
  player: Player;
  teamName: string;
  price: number;
  slot: string;
}

export type DraftPhase =
  | "setup"
  | "nomination"
  | "bidding"
  | "user-confirm"
  | "sold"
  | "complete";

export interface MockDraftState {
  phase: DraftPhase;
  rosters: AIRoster[];
  undraftedPlayers: Player[];
  snakeOrder: number[];
  currentOrderIdx: number;
  nominatedPlayer: Player | null;
  currentBid: number;
  currentBidder: string;
  userBid: number;
  log: DraftLogEntry[];
  suggestion: { player: Player; reason: string } | null;
  // AI bid queue: teams yet to bid in the current bidding round
  pendingAIBids: string[];
  // Whether we're in a "re-bid" round triggered by user keeping bidding
  isRebidRound: boolean;
  message: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AI_BID_DELAY_MS   = 850;
const SOLD_DELAY_MS     = 1600;
const NOMINATE_DELAY_MS = 1100;

// ─── localStorage helpers ─────────────────────────────────────────────────────

function storageKey(leagueId: string) {
  return `amethyst-mock-draft-${leagueId}`;
}

function saveState(leagueId: string, state: MockDraftState) {
  if (!leagueId) return;
  try {
    localStorage.setItem(storageKey(leagueId), JSON.stringify(state));
  } catch {
    // storage full — non-fatal
  }
}

function loadState(leagueId: string): MockDraftState | null {
  if (!leagueId) return null;
  try {
    const raw = localStorage.getItem(storageKey(leagueId));
    return raw ? (JSON.parse(raw) as MockDraftState) : null;
  } catch {
    return null;
  }
}

function clearState(leagueId: string) {
  if (!leagueId) return;
  try {
    localStorage.removeItem(storageKey(leagueId));
  } catch { /* noop */ }
}

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL_STATE: MockDraftState = {
  phase: "setup",
  rosters: [],
  undraftedPlayers: [],
  snakeOrder: [],
  currentOrderIdx: 0,
  nominatedPlayer: null,
  currentBid: 0,
  currentBidder: "",
  userBid: 1,
  log: [],
  suggestion: null,
  pendingAIBids: [],
  isRebidRound: false,
  message: "",
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMockDraft(
  leagueId: string,
  teamNames: string[],
  budget: number,
  rosterSlots: Record<string, number>,
  allPlayers: Player[],
  watchlist: Player[],
) {
  const totalSlots = Object.values(rosterSlots).reduce((a, b) => a + b, 0);
  const numRounds  = totalSlots;

  // Load saved state for this league, fall back to setup
  const [state, setState] = useState<MockDraftState>(() => {
    const saved = loadState(leagueId);
    // Only restore if the draft was in progress (not setup/complete)
    if (saved && saved.phase !== "setup" && saved.phase !== "complete") {
      // Reset any mid-flight async state so timers don't fire stale
      return {
        ...saved,
        pendingAIBids: [],
        isRebidRound: false,
        phase: saved.phase === "bidding" || saved.phase === "sold"
          ? "nomination"   // safe restore point
          : saved.phase,
        message: "Draft restored — continuing from where you left off.",
      };
    }
    return INITIAL_STATE;
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // Persist state whenever it changes (skip setup/complete — no need to save)
  useEffect(() => {
    if (state.phase !== "setup" && state.phase !== "complete") {
      saveState(leagueId, state);
    }
  }, [state, leagueId]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const currentTeamIdx = (s: MockDraftState) => s.snakeOrder[s.currentOrderIdx] ?? 0;
  const currentTeam    = (s: MockDraftState) => s.rosters[currentTeamIdx(s)];

  // All AI team names in this draft
  const allAITeams = (s: MockDraftState) =>
    s.rosters.filter((r) => !r.isUser).map((r) => r.teamName);

  // ── Start draft ───────────────────────────────────────────────────────────────

  const startDraft = useCallback(() => {
    const rosters: AIRoster[] = teamNames.map((name, i) => ({
      teamName: name,
      budget,
      spent: 0,
      picks: [],
      isUser: i === 0,
    }));

    const snakeOrder = buildSnakeOrder(teamNames.length, numRounds);
    const undraftedPlayers = [...allPlayers].sort(
      (a, b) => (b.value ?? 0) - (a.value ?? 0),
    );

    const newState: MockDraftState = {
      ...INITIAL_STATE,
      phase: "nomination",
      rosters,
      undraftedPlayers,
      snakeOrder,
      currentOrderIdx: 0,
      log: [],
      message: "",
    };

    setState(newState);
    saveState(leagueId, newState);
  }, [teamNames, budget, numRounds, allPlayers, leagueId]);

  // ── Reset draft ───────────────────────────────────────────────────────────────

  const resetDraft = useCallback(() => {
    clearState(leagueId);
    setState(INITIAL_STATE);
  }, [leagueId]);

  // ── Nominate a player ─────────────────────────────────────────────────────────

  const nominatePlayer = useCallback((player: Player) => {
    setState((prev) => {
      const nomTeam = currentTeam(prev);
      // All other AI teams get queued to bid
      const otherAI = prev.rosters
        .filter((r) => !r.isUser && r.teamName !== nomTeam?.teamName)
        .map((r) => r.teamName);

      return {
        ...prev,
        phase: "bidding",
        nominatedPlayer: player,
        currentBid: 1,
        currentBidder: nomTeam?.teamName ?? "",
        userBid: 2,
        pendingAIBids: otherAI,
        isRebidRound: false,
        message: `${player.name} is up for auction! Bidding starts at $1.`,
      };
    });
  }, []);

  // ── User places a bid ─────────────────────────────────────────────────────────

  const placeBid = useCallback((amount: number) => {
    setState((prev) => {
      if (prev.phase !== "bidding") return prev;

      const userRoster = prev.rosters.find((r) => r.isUser);
      if (!userRoster) return prev;

      const remaining  = userRoster.budget - userRoster.spent;
      const open       = openSlots(userRoster, rosterSlots);
      const mustKeep   = Math.max(0, open - 1);
      const maxAllowed = remaining - mustKeep;

      if (amount > maxAllowed) {
        return { ...prev, message: `You can't bid more than $${maxAllowed}.` };
      }
      if (amount <= prev.currentBid) {
        return { ...prev, message: `Bid must be higher than current $${prev.currentBid}.` };
      }

      // After user bids, ALL AI teams get re-queued to respond
      const aiQueue = allAITeams(prev);

      return {
        ...prev,
        currentBid: amount,
        currentBidder: userRoster.teamName,
        userBid: amount + 1,
        pendingAIBids: aiQueue,
        isRebidRound: false,
        message: `You bid $${amount}! AI teams are responding...`,
      };
    });
  }, [rosterSlots]);

  // ── User keeps bidding (from confirm screen) ──────────────────────────────────

  const keepBidding = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "bidding",
      // Re-queue all AI teams so they get a chance to outbid
      pendingAIBids: allAITeams(prev),
      isRebidRound: true,
      message: "Bidding continues — AI teams will respond...",
    }));
  }, []);

  // ── Sell player ───────────────────────────────────────────────────────────────

  const sellPlayer = useCallback((s: MockDraftState) => {
    if (!s.nominatedPlayer) return;

    const player  = s.nominatedPlayer;
    const price   = s.currentBid;
    const winner  = s.rosters.find((r) => r.teamName === s.currentBidder);
    if (!winner) return;

    // Determine roster slot
    const pos      = player.positions?.[0] ?? player.position ?? "UTIL";
    const filled   = winner.picks.filter((p) => p.slot === pos).length;
    const slotCount = rosterSlots[pos] ?? 0;
    const isPit    = ["SP", "RP", "P"].includes(pos);

    let slot = pos;
    if (filled >= slotCount) {
      const utilFilled = winner.picks.filter((p) => p.slot === "UTIL").length;
      const utilCount  = rosterSlots["UTIL"] ?? 0;
      slot = (!isPit && utilFilled < utilCount) ? "UTIL" : "BN";
    }

    const pick: AIPick = { player, price, slot };
    const logEntry: DraftLogEntry = {
      pickNum:  s.log.length + 1,
      player,
      teamName: s.currentBidder,
      price,
      slot,
    };

    const newRosters = s.rosters.map((r) =>
      r.teamName === s.currentBidder
        ? { ...r, spent: r.spent + price, picks: [...r.picks, pick] }
        : r,
    );

    const newUndrafted = s.undraftedPlayers.filter((p) => p.id !== player.id);
    const nextIdx      = s.currentOrderIdx + 1;
    const isDone       = nextIdx >= s.snakeOrder.length || newUndrafted.length === 0;

    const newState: MockDraftState = {
      ...s,
      phase: isDone ? "complete" : "nomination",
      rosters: newRosters,
      undraftedPlayers: newUndrafted,
      currentOrderIdx: nextIdx,
      nominatedPlayer: null,
      currentBid: 0,
      currentBidder: "",
      userBid: 1,
      pendingAIBids: [],
      isRebidRound: false,
      log: [...s.log, logEntry],
      message: isDone
        ? "Draft complete!"
        : `${s.currentBidder} wins ${player.name} for $${price}!`,
    };

    setState(newState);
    if (isDone) clearState(leagueId);
    else saveState(leagueId, newState);
  }, [rosterSlots, leagueId]);

  // ── Confirm sell ──────────────────────────────────────────────────────────────

  const confirmSell = useCallback(() => {
    setState((prev) => ({ ...prev, phase: "sold" }));
    setTimeout(() => sellPlayer(stateRef.current), SOLD_DELAY_MS);
  }, [sellPlayer]);

  // ── Suggestion for user's nomination turn ─────────────────────────────────────

  useEffect(() => {
    if (state.phase !== "nomination") return;
    const team = currentTeam(state);
    if (!team?.isUser) return;

    const suggestion = suggestNomination(
      team,
      watchlist,
      state.undraftedPlayers,
      rosterSlots,
      state.rosters,
    );
    setState((prev) => ({ ...prev, suggestion }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.currentOrderIdx]);

  // ── AI nomination trigger ─────────────────────────────────────────────────────

  useEffect(() => {
    if (state.phase !== "nomination") return;
    const team = currentTeam(state);
    if (!team || team.isUser) return;

    setState((prev) => ({
      ...prev,
      message: `${team.teamName} is choosing a player...`,
    }));

    const timer = setTimeout(() => {
      const s = stateRef.current;
      if (s.phase !== "nomination") return;
      const nominated = aiNominate(team, s.undraftedPlayers, rosterSlots, s.rosters);
      if (nominated) nominatePlayer(nominated);
    }, NOMINATE_DELAY_MS);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.currentOrderIdx]);

  // ── AI bidding engine ─────────────────────────────────────────────────────────
  //
  // Processes one AI team at a time from pendingAIBids.
  // When the queue empties:
  //   - If user is NOT the high bidder → auto-sell (show user-confirm to let them
  //     decide if they want to jump back in)
  //   - If user IS the high bidder → show user-confirm so they can keep bidding
  //     or accept the win
  //
  useEffect(() => {
    if (state.phase !== "bidding") return;
    if (state.pendingAIBids.length === 0) {
      // All AI teams have had their say — prompt user
      setState((prev) => {
        if (prev.phase !== "bidding") return prev;
        return { ...prev, phase: "user-confirm" };
      });
      return;
    }

    if (!state.nominatedPlayer) return;

    const nextAIName  = state.pendingAIBids[0];
    const nextAIRoster = state.rosters.find((r) => r.teamName === nextAIName);

    const timer = setTimeout(() => {
      const s = stateRef.current;
      if (s.phase !== "bidding") return;
      if (!s.nominatedPlayer)   return;

      if (!nextAIRoster) {
        // Team not found — skip it
        setState((prev) => ({
          ...prev,
          pendingAIBids: prev.pendingAIBids.slice(1),
        }));
        return;
      }

      const bid = aiMaxBid(
        s.nominatedPlayer,
        nextAIRoster,
        s.currentBid,
        rosterSlots,
        s.rosters,
        s.undraftedPlayers,
      );

      if (bid > 0) {
        // AI places a bid — re-queue ALL other AI teams to respond
        const otherAI = s.rosters
          .filter((r) => !r.isUser && r.teamName !== nextAIName)
          .map((r) => r.teamName);

        setState((prev) => ({
          ...prev,
          currentBid: bid,
          currentBidder: nextAIName,
          userBid: bid + 1,
          // Other AI teams must now respond to this new high bid
          pendingAIBids: otherAI,
          isRebidRound: false,
          message: `${nextAIName} bids $${bid}!`,
        }));
      } else {
        // AI passes — move to next in queue
        setState((prev) => ({
          ...prev,
          pendingAIBids: prev.pendingAIBids.slice(1),
          message: `${nextAIName} passes.`,
        }));
      }
    }, AI_BID_DELAY_MS);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.pendingAIBids, state.currentBid]);

  return {
    state,
    startDraft,
    resetDraft,
    nominatePlayer,
    placeBid,
    keepBidding,
    confirmSell,
    currentTeamIdx: currentTeamIdx(state),
    isUserTurn: currentTeam(state)?.isUser ?? false,
    hasSavedDraft: loadState(leagueId) !== null,
  };
}