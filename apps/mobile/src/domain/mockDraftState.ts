import type { Player } from "../types/player";
import type { AIRoster } from "../utils/mockDraftAI";

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
  pendingAIBids: string[];
  message: string;
}

export const initialMockDraftState: MockDraftState = {
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
};