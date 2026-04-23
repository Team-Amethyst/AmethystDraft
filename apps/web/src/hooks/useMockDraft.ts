/**
 * useMockDraft
 *
 * Manages all state for the AI Mock Draft feature.
 * Handles: snake order, AI turns, bidding rounds, roster tracking,
 * user confirmations, and the draft log.
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
  | "setup"           // not started yet
  | "nomination"      // current team picks a player to auction
  | "bidding"         // auction in progress
  | "user-confirm"    // user must confirm they're done bidding
  | "sold"            // brief sold animation
  | "complete";       // all picks done

export interface MockDraftState {
  phase: DraftPhase;
  rosters: AIRoster[];
  undraftedPlayers: Player[];
  snakeOrder: number[];
  currentOrderIdx: number;
  nominatedPlayer: Player | null;
  currentBid: number;
  currentBidder: string;        // team name of highest bidder
  userBid: number;              // user's current bid input
  log: DraftLogEntry[];
  suggestion: { player: Player; reason: string } | null;
  pendingAIBids: string[];      // teams that still need to bid this round
  message: string;              // status message shown in auction center
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const AI_BID_DELAY_MS  = 900;   // pause between AI bids (feels natural)
const SOLD_DELAY_MS    = 1800;  // how long "SOLD" screen shows
const NOMINATE_DELAY_MS = 1200; // pause before AI nominates

export function useMockDraft(
  teamNames: string[],
  budget: number,
  rosterSlots: Record<string, number>,
  allPlayers: Player[],
  watchlist: Player[],
) {
  const totalSlots = Object.values(rosterSlots).reduce((a, b) => a + b, 0);
  const numRounds  = totalSlots;

  const [state, setState] = useState<MockDraftState>({
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
    message: "",
  });

  // Use a ref for state inside async callbacks to avoid stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Start draft ─────────────────────────────────────────────────────────────

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

    setState((prev) => ({
      ...prev,
      phase: "nomination",
      rosters,
      undraftedPlayers,
      snakeOrder,
      currentOrderIdx: 0,
      log: [],
      message: "",
    }));
  }, [teamNames, budget, numRounds, allPlayers]);

  // ── Current nominating team ─────────────────────────────────────────────────

  const currentTeamIdx = (s: MockDraftState) =>
    s.snakeOrder[s.currentOrderIdx] ?? 0;

  const currentTeam = (s: MockDraftState) =>
    s.rosters[currentTeamIdx(s)];

  // ── Nominate a player ───────────────────────────────────────────────────────

  const nominatePlayer = useCallback((player: Player) => {
    setState((prev) => {
      const allOtherAI = prev.rosters
        .filter((r) => !r.isUser && r.teamName !== currentTeam(prev)?.teamName)
        .map((r) => r.teamName);

      return {
        ...prev,
        phase: "bidding",
        nominatedPlayer: player,
        currentBid: 1,
        currentBidder: currentTeam(prev)?.teamName ?? "",
        userBid: 1,
        pendingAIBids: allOtherAI,
        message: `${player.name} nominated! Bidding starts at $1.`,
      };
    });
  }, []);

  // ── User places a bid ───────────────────────────────────────────────────────

  const userBid = useCallback((amount: number) => {
    setState((prev) => {
      if (prev.phase !== "bidding") return prev;
      const userRoster = prev.rosters.find((r) => r.isUser);
      if (!userRoster) return prev;

      const remaining = userRoster.budget - userRoster.spent;
      const open = openSlots(userRoster, rosterSlots);
      const mustKeep = Math.max(0, open - 1);
      const maxAllowed = remaining - mustKeep;

      if (amount > maxAllowed) {
        return { ...prev, message: `You can't bid more than $${maxAllowed}` };
      }
      if (amount <= prev.currentBid) {
        return { ...prev, message: `Bid must be higher than current $${prev.currentBid}` };
      }

      const userRosterName = userRoster.teamName;
      // After user bids, queue remaining AI teams to respond
      const pendingAI = prev.rosters
        .filter((r) => !r.isUser)
        .map((r) => r.teamName);

      return {
        ...prev,
        currentBid: amount,
        currentBidder: userRosterName,
        userBid: amount + 1,
        pendingAIBids: pendingAI,
        message: `You bid $${amount}!`,
      };
    });
  }, [rosterSlots]);

  // ── Sell player to highest bidder ───────────────────────────────────────────

  const sellPlayer = useCallback((s: MockDraftState) => {
    if (!s.nominatedPlayer) return;

    const winnerRoster = s.rosters.find((r) => r.teamName === s.currentBidder);
    if (!winnerRoster) return;

    const player = s.nominatedPlayer;
    const price  = s.currentBid;
    const pos    = player.positions?.[0] ?? player.position ?? "UTIL";

    // Find best slot
    let slot = pos;
    const filled = winnerRoster.picks.filter((p) => p.slot === pos).length;
    const slotCount = rosterSlots[pos] ?? 0;
    if (filled >= slotCount) {
      const isPit = ["SP", "RP", "P"].includes(pos);
      slot = !isPit && (winnerRoster.picks.filter((p) => p.slot === "UTIL").length < (rosterSlots["UTIL"] ?? 0))
        ? "UTIL" : "BN";
    }

    const pick: AIPick = { player, price, slot };
    const logEntry: DraftLogEntry = {
      pickNum: s.log.length + 1,
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
    const nextOrderIdx = s.currentOrderIdx + 1;
    const isDone = nextOrderIdx >= s.snakeOrder.length || newUndrafted.length === 0;

    setState({
      ...s,
      phase: isDone ? "complete" : "nomination",
      rosters: newRosters,
      undraftedPlayers: newUndrafted,
      currentOrderIdx: nextOrderIdx,
      nominatedPlayer: null,
      currentBid: 0,
      currentBidder: "",
      userBid: 1,
      pendingAIBids: [],
      log: [...s.log, logEntry],
      message: isDone
        ? "Draft complete!"
        : `${s.currentBidder} wins ${player.name} for $${price}!`,
    });
  }, [rosterSlots]);

  // ── User confirms done bidding ──────────────────────────────────────────────

  const confirmDoneBidding = useCallback(() => {
    setState((prev) => ({ ...prev, phase: "user-confirm" }));
  }, []);

  const confirmSell = useCallback(() => {
    //const s = stateRef.current;               // THIS WAS COMMENTED OUT BY MEE
    setState((prev) => ({ ...prev, phase: "sold" }));
    setTimeout(() => sellPlayer(stateRef.current), SOLD_DELAY_MS);
  }, [sellPlayer]);

  const keepBidding = useCallback(() => {
    setState((prev) => ({ ...prev, phase: "bidding" }));
  }, []);

  // ── Update suggestion when it's user's nomination turn ──────────────────────

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

  // ── AI nomination trigger ───────────────────────────────────────────────────

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
      const nominated = aiNominate(
        team,
        s.undraftedPlayers,
        rosterSlots,
        s.rosters,
      );
      if (nominated) nominatePlayer(nominated);
    }, NOMINATE_DELAY_MS);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.currentOrderIdx]);

  // ── AI bidding round ────────────────────────────────────────────────────────

  useEffect(() => {
    if (state.phase !== "bidding") return;
    if (state.pendingAIBids.length === 0) return;
    if (!state.nominatedPlayer) return;

    const nextAI = state.pendingAIBids[0];
    const aiRoster = state.rosters.find((r) => r.teamName === nextAI);
    if (!aiRoster) {
      setState((prev) => ({
        ...prev,
        pendingAIBids: prev.pendingAIBids.slice(1),
      }));
      return;
    }

    const timer = setTimeout(() => {
      const s = stateRef.current;
      if (s.phase !== "bidding") return;

      const bid = aiMaxBid(
        s.nominatedPlayer!,
        aiRoster,
        s.currentBid,
        rosterSlots,
        s.rosters,
        s.undraftedPlayers,
      );

      if (bid > 0) {
        setState((prev) => ({
          ...prev,
          currentBid: bid,
          currentBidder: nextAI,
          userBid: bid + 1,
          pendingAIBids: prev.pendingAIBids.slice(1),
          message: `${nextAI} bids $${bid}`,
        }));
      } else {
        // AI passes
        setState((prev) => {
          const remaining = prev.pendingAIBids.slice(1);
          // If all AI passed and user is not high bidder, check if done
          if (remaining.length === 0) {
            const userRoster = prev.rosters.find((r) => r.isUser);
            const userIsWinning = prev.currentBidder === userRoster?.teamName;
            if (!userIsWinning) {
              // Auto-sell: no user bid, AI won
              return { ...prev, phase: "user-confirm", pendingAIBids: [] };
            }
          }
          return { ...prev, pendingAIBids: remaining };
        });
      }
    }, AI_BID_DELAY_MS);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.pendingAIBids, state.currentBid]);

  // When all AI bids resolve and user has highest bid, show confirm prompt
  useEffect(() => {
    if (state.phase !== "bidding") return;
    if (state.pendingAIBids.length > 0) return;
    const userRoster = state.rosters.find((r) => r.isUser);
    if (!userRoster) return;
    // Prompt user to confirm they're done
    setState((prev) => ({
      ...prev,
      phase: "user-confirm",
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pendingAIBids.length, state.phase]);

  return {
    state,
    startDraft,
    nominatePlayer,
    userBid,
    confirmDoneBidding,
    confirmSell,
    keepBidding,
    currentTeamIdx: currentTeamIdx(state),
    isUserTurn: currentTeam(state)?.isUser ?? false,
  };
}