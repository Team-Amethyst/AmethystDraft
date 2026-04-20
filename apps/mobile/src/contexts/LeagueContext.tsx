import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getMyLeagues } from "../api/leagues";
import { useAuth } from "./AuthContext";
import type { League } from "../types/league";

interface LeagueContextType {
  allLeagues: League[];
  loading: boolean;
  refreshLeagues: () => Promise<void>;
}

const LeagueContext = createContext<LeagueContextType>({
  allLeagues: [],
  loading: false,
  refreshLeagues: async () => {},
});

export function LeagueProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [allLeagues, setAllLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshLeagues = useCallback(async () => {
    if (!token) {
      setAllLeagues([]);
      return;
    }

    setLoading(true);

    try {
      const leagues = await getMyLeagues(token);
      setAllLeagues(leagues);
    } catch {
      setAllLeagues([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refreshLeagues();
  }, [refreshLeagues]);

  return (
    <LeagueContext.Provider value={{ allLeagues, loading, refreshLeagues }}>
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  return useContext(LeagueContext);
}