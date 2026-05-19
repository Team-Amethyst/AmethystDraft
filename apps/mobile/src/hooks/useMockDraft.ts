import { useCallback, useEffect, useRef, useState } from "react";
import type { Player } from "../types/player";
import {
  initialMockDraftState,
  type DraftLogEntry,
  type MockDraftState,
} from "../domain/mockDraftState";
import {
  aiMaxBid,
  aiNominate,
  buildSnakeOrder,
  openSlots,
  suggestNomination,
  type AIRoster,
  type AIPick,
} from "../utils/mockDraftAI";
import {
  clearMockDraftState,
  loadMockDraftState,
  saveMockDraftState,
} from "../utils/mockDraftPersistence";

const AI_BID_DELAY_MS = 850;
const SOLD_DELAY_MS = 1600;
const NOMINATE_DELAY_MS = 1100;

export function useMockDraft(
  leagueId: string,
  teamNames: string[],
  budget: number,
  rosterSlots: Record<string, number>,
  allPlayers: Player[],
  watchlist: Player[],
) {
  const [state, setState] = useState<MockDraftState>(initialMockDraftState);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  const totalSlots = Object.values(rosterSlots).reduce((sum, value) => sum + value, 0);

  const currentTeamIdx = useCallback(
    (s: MockDraftState) => s.snakeOrder[s.currentOrderIdx] ?? 0,
    [],
  );

  const currentTeam = useCallback(
    (s: MockDraftState) => s.rosters[currentTeamIdx(s)],
    [currentTeamIdx],
  );

  const allAITeams = useCallback(
    (s: MockDraftState) => s.rosters.filter((r) => !r.isUser).map((r) => r.teamName),
    [],
  );

  useEffect(() => {
    let active = true;

    async function loadSaved() {
      const saved = await loadMockDraftState(leagueId);

      if (!active) return;

      if (saved && saved.phase !== "setup" && saved.phase !== "complete") {
        setState({
          ...saved,
          pendingAIBids: [],
          isRebidRound: false,
          phase:
            saved.phase === "bidding" || saved.phase === "sold"
              ? "nomination"
              : saved.phase,
          message: "Draft restored from saved mobile state.",
        });
        setHasSavedDraft(true);
      } else {
        setState(initialMockDraftState);
        setHasSavedDraft(false);
      }

      setStorageLoaded(true);
    }

    setStorageLoaded(false);
    void loadSaved();

    return () => {
      active = false;
    };
  }, [leagueId]);

  useEffect(() => {
    if (!storageLoaded) return;

    if (state.phase !== "setup" && state.phase !== "complete") {
      void saveMockDraftState(leagueId, state);
      setHasSavedDraft(true);
    }
  }, [state, leagueId, storageLoaded]);

  const startDraft = useCallback(() => {
    const rosters: AIRoster[] = teamNames.map((teamName, index) => ({
      teamName,
      budget,
      spent: 0,
      picks: [],
      isUser: index === 0,
    }));

    const snakeOrder = buildSnakeOrder(teamNames.length, totalSlots);
    const undraftedPlayers = [...allPlayers].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    setState({
      ...initialMockDraftState,
      phase: "nomination",
      checkpointHydration: undefined,
      rosters,
      undraftedPlayers,
      snakeOrder,
      currentOrderIdx: 0,
      log: [],
      isRebidRound: false,
      message: "Mock draft started.",
    });
  }, [teamNames, budget, totalSlots, allPlayers]);

  const resetDraft = useCallback(async () => {
    await clearMockDraftState(leagueId);
    setState(initialMockDraftState);
    setHasSavedDraft(false);
  }, [leagueId]);

  const hydrateFromCheckpoint = useCallback(
    async (full: MockDraftState) => {
      await clearMockDraftState(leagueId);
      setState(full);
      await saveMockDraftState(leagueId, full);
      setHasSavedDraft(true);
    },
    [leagueId],
  );

  const nominatePlayer = useCallback((player: Player) => {
    setState((prev) => {
      const nomTeam = currentTeam(prev);

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
        message: `${player.name} is nominated. Bidding starts at $1.`,
      };
    });
  }, [currentTeam]);

  const placeBid = useCallback((amount: number) => {
    setState((prev) => {
      if (prev.phase !== "bidding" || !prev.nominatedPlayer) return prev;

      const userRoster = prev.rosters.find((r) => r.isUser);
      if (!userRoster) return prev;

      const slots = prev.checkpointHydration?.rosterSlots ?? rosterSlots;
      const remaining = userRoster.budget - userRoster.spent;
      const open = openSlots(userRoster, slots);
      const maxAllowed = remaining - Math.max(0, open - 1);

      if (amount <= prev.currentBid) {
        return { ...prev, message: `Bid must beat $${prev.currentBid}.` };
      }

      if (amount > maxAllowed) {
        return { ...prev, message: `You can bid at most $${maxAllowed}.` };
      }

      return {
        ...prev,
        currentBid: amount,
        currentBidder: userRoster.teamName,
        userBid: amount + 1,
        pendingAIBids: allAITeams(prev),
        isRebidRound: false,
        message: `You bid $${amount}. AI teams are responding.`,
      };
    });
  }, [rosterSlots, allAITeams]);

  const keepBidding = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "bidding",
      pendingAIBids: allAITeams(prev),
      isRebidRound: true,
      message: "Bidding continues.",
    }));
  }, [allAITeams]);

  const sellPlayer = useCallback((s: MockDraftState) => {
    if (!s.nominatedPlayer) return;

    const player = s.nominatedPlayer;
    const winner = s.rosters.find((r) => r.teamName === s.currentBidder);
    if (!winner) return;

    const slots = s.checkpointHydration?.rosterSlots ?? rosterSlots;
    const pos = player.positions?.[0] ?? player.position ?? "UTIL";
    const filled = winner.picks.filter((pick) => pick.slot === pos).length;
    const slotCount = slots[pos] ?? 0;

    let slot = pos;

    if (filled >= slotCount) {
      const utilFilled = winner.picks.filter((pick) => pick.slot === "UTIL").length;
      const utilCount = slots.UTIL ?? 0;
      const pitcher = ["SP", "RP", "P"].includes(pos);
      slot = !pitcher && utilFilled < utilCount ? "UTIL" : "BN";
    }

    const pick: AIPick = {
      player,
      price: s.currentBid,
      slot,
    };

    const logEntry: DraftLogEntry = {
      pickNum: s.log.length + 1,
      player,
      teamName: s.currentBidder,
      price: s.currentBid,
      slot,
    };

    const nextRosters = s.rosters.map((r) =>
      r.teamName === s.currentBidder
        ? { ...r, spent: r.spent + s.currentBid, picks: [...r.picks, pick] }
        : r,
    );

    const nextUndrafted = s.undraftedPlayers.filter((p) => p.id !== player.id);
    const nextIndex = s.currentOrderIdx + 1;
    const done = nextIndex >= s.snakeOrder.length || nextUndrafted.length === 0;

    setState({
      ...s,
      phase: done ? "complete" : "nomination",
      rosters: nextRosters,
      undraftedPlayers: nextUndrafted,
      currentOrderIdx: nextIndex,
      nominatedPlayer: null,
      currentBid: 0,
      currentBidder: "",
      userBid: 1,
      pendingAIBids: [],
      isRebidRound: false,
      log: [...s.log, logEntry],
      message: done
        ? "Mock draft complete."
        : `${s.currentBidder} wins ${player.name} for $${s.currentBid}.`,
    });
  }, [rosterSlots]);

  const confirmSell = useCallback(() => {
    setState((prev) => {
      const playerName = prev.nominatedPlayer?.name ?? "player";
      const bidder = prev.currentBidder || "Winning team";
      const amount = prev.currentBid;

      return {
        ...prev,
        phase: "sold",
        message: `${bidder} wins ${playerName} for $${amount}.`,
      };
    });

    setTimeout(() => sellPlayer(stateRef.current), SOLD_DELAY_MS);
  }, [sellPlayer]);

  useEffect(() => {
    if (state.phase !== "nomination") return;

    const team = currentTeam(state);
    if (!team?.isUser) return;

    const slots = state.checkpointHydration?.rosterSlots ?? rosterSlots;

    const suggestion = suggestNomination(
      team,
      watchlist,
      state.undraftedPlayers,
      slots,
    );

    setState((prev) => ({ ...prev, suggestion }));
  }, [
    state.phase,
    state.currentOrderIdx,
    state.checkpointHydration,
    currentTeam,
    watchlist,
    rosterSlots,
  ]);

  useEffect(() => {
    if (state.phase !== "nomination") return;

    const team = currentTeam(state);
    if (!team || team.isUser) return;

    const timer = setTimeout(() => {
      const current = stateRef.current;
      const roster = currentTeam(current);

      if (current.phase !== "nomination" || !roster || roster.isUser) return;

      const slots = current.checkpointHydration?.rosterSlots ?? rosterSlots;

      const nominated = aiNominate(
        roster,
        current.undraftedPlayers,
        slots,
      );

      if (nominated) nominatePlayer(nominated);
    }, NOMINATE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [state.phase, state.currentOrderIdx, currentTeam, rosterSlots, nominatePlayer]);

  useEffect(() => {
    if (state.phase !== "bidding") return;

    if (state.pendingAIBids.length === 0) {
      setState((prev) => (prev.phase === "bidding" ? { ...prev, phase: "user-confirm" } : prev));
      return;
    }

    const nextAIName = state.pendingAIBids[0];

    const timer = setTimeout(() => {
      const current = stateRef.current;

      if (current.phase !== "bidding" || !current.nominatedPlayer) return;

      const roster = current.rosters.find((r) => r.teamName === nextAIName);

      if (!roster) {
        setState((prev) => ({
          ...prev,
          pendingAIBids: prev.pendingAIBids.slice(1),
        }));
        return;
      }

      const slots = current.checkpointHydration?.rosterSlots ?? rosterSlots;

      const bid = aiMaxBid(
        current.nominatedPlayer,
        roster,
        current.currentBid,
        slots,
        current.undraftedPlayers,
      );

      if (bid > 0) {
        const otherAI = current.rosters
          .filter((r) => !r.isUser && r.teamName !== nextAIName)
          .map((r) => r.teamName);

        setState((prev) => ({
          ...prev,
          currentBid: bid,
          currentBidder: nextAIName,
          userBid: bid + 1,
          pendingAIBids: otherAI,
          isRebidRound: false,
          message: `${nextAIName} bids $${bid}.`,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          pendingAIBids: prev.pendingAIBids.slice(1),
          message: `${nextAIName} passes.`,
        }));
      }
    }, AI_BID_DELAY_MS);

    return () => clearTimeout(timer);
  }, [state.phase, state.pendingAIBids, rosterSlots]);

  return {
    state,
    storageLoaded,
    hasSavedDraft,
    startDraft,
    resetDraft,
    hydrateFromCheckpoint,
    nominatePlayer,
    placeBid,
    keepBidding,
    confirmSell,
    currentTeamIdx: currentTeamIdx(state),
    isUserTurn: currentTeam(state)?.isUser ?? false,
  };
}