import { Outlet, useParams } from "react-router";
import { useLeague, LeagueContext } from "../contexts/LeagueContext";
import { SelectedPlayerProvider } from "../contexts/SelectedPlayerContext";
import { ClearSelectedPlayerOnLeagueChange } from "./ClearSelectedPlayerOnLeagueChange";
import { PlayerNotesProvider } from "../contexts/PlayerNotesContext";
import { WatchlistProvider } from "../contexts/WatchlistContext";
import AuthNavbar from "./AuthNavbar";

export default function LeagueLayout() {
  const { id } = useParams<{ id: string }>();
  const { allLeagues, loading, refreshLeagues } = useLeague();
  const league = allLeagues.find((l) => l.id === id) ?? null;

  return (
    <LeagueContext.Provider
      value={{ league, allLeagues, loading, refreshLeagues }}
    >
      <SelectedPlayerProvider>
        <ClearSelectedPlayerOnLeagueChange />
        <PlayerNotesProvider key={id}>
          <WatchlistProvider key={id}>
            <AuthNavbar />
            <Outlet />
          </WatchlistProvider>
        </PlayerNotesProvider>
      </SelectedPlayerProvider>
    </LeagueContext.Provider>
  );
}
