import { Outlet, useParams } from 'react-router';
import { LeagueContext } from '../contexts/LeagueContext';
import type { League } from '../contexts/LeagueContext';
import AuthNavbar from './AuthNavbar';

// Mirror of mock data in LeagueDetail — replace both with API calls when backend is ready
const mockLeagueMap: Record<string, League> = {
  "1": {
    id: "1",
    name: "Fantasy Masters 2026",
    status: "Pre-Draft",
    teams: 12,
    budget: 260,
    draftDate: "March 15, 2026",
    format: "Rotisserie",
  },
  "2": {
    id: "2",
    name: "Office League",
    status: "In Progress",
    teams: 10,
    budget: 200,
    draftDate: "March 1, 2026",
    format: "Head-to-Head",
  },
};

export default function LeagueLayout() {
  const { id } = useParams<{ id: string }>();
  const league = (id && mockLeagueMap[id]) || null;

  return (
    <LeagueContext.Provider value={{ league }}>
      <AuthNavbar />
      <Outlet />
    </LeagueContext.Provider>
  );
}
