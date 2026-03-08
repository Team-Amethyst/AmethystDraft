import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import { getMyLeagues } from "../api/leagues";
import { useAuth } from "./AuthContext";

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

interface LeagueContextType {
  league: League | null;
  allLeagues: League[];
  loading: boolean;
  refreshLeagues: () => void;
}

export const LeagueContext = createContext<LeagueContextType>({
  league: null,
  allLeagues: [],
  loading: false,
  refreshLeagues: () => {},
});

export function LeagueProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [allLeagues, setAllLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLeagues = useCallback(async () => {
    if (!token) {
      setAllLeagues([]);
      return;
    }
    setLoading(true);
    try {
      const leagues = await getMyLeagues(token);
      setAllLeagues(leagues);
    } catch {
      // non-fatal — leagues page will show empty state
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchLeagues();
  }, [fetchLeagues]);

  return (
    <LeagueContext.Provider
      value={{
        league: null,
        allLeagues,
        loading,
        refreshLeagues: fetchLeagues,
      }}
    >
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  return useContext(LeagueContext);
}
