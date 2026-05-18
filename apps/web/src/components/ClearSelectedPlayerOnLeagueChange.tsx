import { useEffect } from "react";
import { useParams } from "react-router";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";

/** Drops Command Center selection when navigating between leagues. */
export function ClearSelectedPlayerOnLeagueChange() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { setSelectedPlayer } = useSelectedPlayer();

  useEffect(() => {
    setSelectedPlayer(null);
  }, [leagueId, setSelectedPlayer]);

  return null;
}
