export interface League {
  id: string;
  name: string;
  commissionerId: string;
  memberIds: string[];
  budget: number;
  hitterBudgetPct: number;
  teams: number;
  scoringFormat: string;
  scoringCategories: { name: string; type: "batting" | "pitching" }[];
  rosterSlots: Record<string, number>;
  draftStatus: "pre-draft" | "in-progress" | "completed";
  isPublic: boolean;
  draftDate?: string;
  playerPool: "Mixed" | "AL" | "NL";
  teamNames: string[];
  posEligibilityThreshold: number;
  createdAt: string;
}