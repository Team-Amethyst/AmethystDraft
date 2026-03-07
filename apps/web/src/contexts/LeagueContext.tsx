import { createContext, useContext } from 'react';

export interface League {
  id: string;
  name: string;
  status: string;
  teams: number;
  budget: number;
  draftDate: string;
  format: string;
}

interface LeagueContextType {
  league: League | null;
}

export const LeagueContext = createContext<LeagueContextType>({ league: null });

export function useLeague() {
  return useContext(LeagueContext);
}
