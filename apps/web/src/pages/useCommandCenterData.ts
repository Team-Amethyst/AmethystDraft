import { useEffect, useMemo, useState } from "react";
import { getPlayers } from "../api/players";
import { getRoster, removeRosterEntry, updateRosterEntry } from "../api/roster";
import type { RosterEntry } from "../api/roster";
import type { League } from "../contexts/LeagueContext";
import type { Player } from "../types/player";
import { getValuation, type ValuationResponse } from "../api/engine";
import { leagueValuationConfigKey, rosterValuationFingerprint } from "../utils/valuationDeps";

export function useCommandCenterData({
  leagueId,
  token,
  league,
  userTeamIdForValuation,
  valuationBoardLogPlayerId,
}: {
  leagueId: string | undefined;
  token: string | null;
  league: League | null;
  userTeamIdForValuation: string;
  valuationBoardLogPlayerId: string | undefined;
}) {
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);
  const [mlbPlayers, setMlbPlayers] = useState<Player[]>([]);
  const [engineMarket, setEngineMarket] = useState<ValuationResponse | null>(null);

  const refreshRoster = () => {
    if (!leagueId || !token) return;
    void getRoster(leagueId, token).then(setRosterEntries).catch(console.error);
  };

  useEffect(() => {
    if (!leagueId || !token) return;
    void getRoster(leagueId, token).then(setRosterEntries).catch(console.error);
  }, [leagueId, token]);

  const rosterValuationKey = useMemo(
    () => rosterValuationFingerprint(rosterEntries),
    [rosterEntries],
  );

  const leagueValuationKey = useMemo(
    () => leagueValuationConfigKey(league ?? null),
    [
      league?.id,
      league?.teams,
      league?.budget,
      league ? JSON.stringify(league.rosterSlots) : "",
      league ? JSON.stringify(league.scoringCategories) : "",
      league?.memberIds?.join(","),
      league?.posEligibilityThreshold,
      league?.playerPool,
      league?.teamNames?.join("\u0001"),
    ],
  );

  useEffect(() => {
    if (!leagueId || !token) return;
    let cancelled = false;
    void getValuation(
      leagueId,
      token,
      userTeamIdForValuation,
      valuationBoardLogPlayerId ?? null,
    )
      .then((res) => {
        if (!cancelled) setEngineMarket(res);
      })
      .catch(() => {
        if (!cancelled) setEngineMarket(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    leagueId,
    token,
    userTeamIdForValuation,
    rosterValuationKey,
    leagueValuationKey,
    valuationBoardLogPlayerId,
  ]);

  useEffect(() => {
    void getPlayers("adp", league?.posEligibilityThreshold, league?.playerPool)
      .then(setMlbPlayers)
      .catch(console.error);
  }, [league?.posEligibilityThreshold, league?.playerPool]);

  const removePick = async (entryId: string): Promise<RosterEntry | undefined> => {
    if (!leagueId || !token) return undefined;
    const entry = rosterEntries.find((e) => e._id === entryId);
    setRosterEntries((prev) => prev.filter((e) => e._id !== entryId));
    try {
      await removeRosterEntry(leagueId, entryId, token);
      return entry;
    } catch (err) {
      refreshRoster();
      throw err;
    }
  };

  const updatePick = async (
    entryId: string,
    data: { price?: number; rosterSlot?: string; teamId?: string },
  ): Promise<RosterEntry | undefined> => {
    if (!leagueId || !token) return undefined;
    const prev = rosterEntries.find((e) => e._id === entryId);
    setRosterEntries((entries) =>
      entries.map((e) => (e._id === entryId ? { ...e, ...data } : e)),
    );
    try {
      await updateRosterEntry(leagueId, entryId, data, token);
      return prev;
    } catch (err) {
      refreshRoster();
      throw err;
    }
  };

  return {
    rosterEntries,
    mlbPlayers,
    engineMarket,
    setRosterEntries,
    refreshRoster,
    removePick,
    updatePick,
  };
}
