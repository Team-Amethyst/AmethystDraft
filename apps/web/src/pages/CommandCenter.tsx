import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";
import { useLeague } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import "./CommandCenter.css";
import { AuctionCenter } from "../components/AuctionCenter";
import { CommandCenterLeftPanel } from "../components/command-center/CommandCenterLeftPanel";
import { CommandCenterRightPanel } from "../components/command-center/CommandCenterRightPanel";
import {
  computeTeamData,
} from "./commandCenterUtils";
import AddPlayerModal from "../components/AddPlayerModal";
import { useCustomPlayers } from "../hooks/useCustomPlayers";
import { resolveUserTeamId } from "../utils/team";
import { readPositionTargetsFromStorage } from "../utils/positionTargetsStorage";
import { useCommandCenterData } from "./useCommandCenterData";
import { COMMAND_CENTER_FALLBACK_SCORING_CATS } from "../constants/commandCenterFallbacks";

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function CommandCenter() {
  usePageTitle("Command Center");
  const { id: leagueId } = useParams<{ id: string }>();
  const { league } = useLeague();
  const { token, user } = useAuth();
  const { selectedPlayer, setSelectedPlayer } = useSelectedPlayer();
  const { customPlayers, addCustomPlayer } = useCustomPlayers();
  const [showAddModal, setShowAddModal] = useState(false);
  const savedPositionTargets = useMemo(
    () => readPositionTargetsFromStorage(leagueId),
    [leagueId],
  );

  const userTeamIdForValuation = useMemo(
    () => resolveUserTeamId(league ?? null, user?.id),
    [league?.id, league?.memberIds?.join(","), user?.id],
  );

  const valuationBoardLogPlayerId =
    import.meta.env.DEV ? selectedPlayer?.id : undefined;

  const {
    rosterEntries,
    mlbPlayers,
    engineMarket,
    refreshRoster,
    removePick,
    updatePick,
  } = useCommandCenterData({
    leagueId,
    token,
    league: league ?? null,
    userTeamIdForValuation,
    valuationBoardLogPlayerId,
  });

  const allPlayers = useMemo(
    () => [...customPlayers, ...mlbPlayers],
    [customPlayers, mlbPlayers],
  );

  // If selectedPlayer was set from the watchlist (stub with mlbId 0 / no real data),
  // replace it with the full player once allPlayers is loaded.
  useEffect(() => {
    if (!selectedPlayer || selectedPlayer.mlbId !== 0) return;
    const full = allPlayers.find((p) => p.id === selectedPlayer.id);
    if (full) setSelectedPlayer(full);
  }, [allPlayers, selectedPlayer, setSelectedPlayer]);

  const draftedIds = useMemo(
    () => new Set(rosterEntries.map((e) => e.externalPlayerId)),
    [rosterEntries],
  );
  const selectedPlayerPositions = useMemo(
    () =>
      selectedPlayer
        ? selectedPlayer.positions?.length
          ? selectedPlayer.positions
          : [selectedPlayer.position]
        : [],
    [selectedPlayer],
  );

  const teamData = useMemo(
    () => (league ? computeTeamData(league, rosterEntries) : []),
    [league, rosterEntries],
  );

  const myTeamIdx = user?.id && league ? league.memberIds.indexOf(user.id) : -1;
  const myTeamName = myTeamIdx >= 0 ? (league?.teamNames[myTeamIdx] ?? "") : "";
  const myTeamId = myTeamIdx >= 0 ? `team_${myTeamIdx + 1}` : null;
  const myTeamEntries = myTeamId
    ? rosterEntries.filter((e) => e.teamId === myTeamId)
    : [];

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleRemovePick = async (entryId: string) => {
    try {
      const entry = await removePick(entryId);
      showToast(`✕ Removed ${entry?.playerName ?? "pick"}`, "info");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Remove failed", "error");
    }
  };

  const handleUpdatePick = async (
    entryId: string,
    data: {
      price?: number;
      rosterSlot?: string;
      teamId?: string;
      keeperContract?: string;
    },
  ) => {
    try {
      const prev = await updatePick(entryId, data);
      const parts: string[] = [];
      if (data.teamId && league) {
        const idx = parseInt(data.teamId.replace("team_", ""), 10) - 1;
        const name = league.teamNames[idx] ?? data.teamId;
        parts.push(`team → ${name}`);
      }
      if (data.rosterSlot) parts.push(`slot → ${data.rosterSlot}`);
      if (data.price !== undefined) parts.push(`price → $${data.price}`);
      showToast(
        `✎ ${prev?.playerName ?? "Pick"} updated${parts.length ? ": " + parts.join(", ") : ""}`,
        "success",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    }
  };

  return (
    <div className="cc-page">
      <div className="cc-layout">
        <CommandCenterLeftPanel
          league={league}
          myTeamName={myTeamName}
          myTeamId={myTeamId}
          selectedPlayerPositions={selectedPlayerPositions}
          allPlayers={allPlayers}
          draftedIds={draftedIds}
          rosterEntries={rosterEntries}
          engineMarket={engineMarket}
          savedPositionTargets={savedPositionTargets}
          fallbackScoringCategories={COMMAND_CENTER_FALLBACK_SCORING_CATS}
        />
        <AuctionCenter
          rosterEntries={rosterEntries}
          refreshRoster={refreshRoster}
          allPlayers={allPlayers}
          selectedPlayer={selectedPlayer}
          setSelectedPlayer={setSelectedPlayer}
          draftedIds={draftedIds}
          myTeamEntries={myTeamEntries}
          showToast={showToast}
          onAddMissingPlayer={() => setShowAddModal(true)}
          engineMarket={engineMarket}
        />
        <CommandCenterRightPanel
          league={league}
          teamData={teamData}
          myTeamName={myTeamName}
          myTeamId={myTeamId}
          rosterEntries={rosterEntries}
          engineMarket={engineMarket}
          selectedPlayer={selectedPlayer}
          selectedPlayerPositions={selectedPlayerPositions}
          allPlayers={allPlayers}
          onRemovePick={handleRemovePick}
          onUpdatePick={handleUpdatePick}
          fallbackScoringCategories={COMMAND_CENTER_FALLBACK_SCORING_CATS}
        />
      </div>

      {toast && (
        <div className={`cc-toast cc-toast-${toast.type}`}>{toast.message}</div>
      )}

      <AddPlayerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={(player) => {
          addCustomPlayer(player);
          setSelectedPlayer(player);
        }}
      />
    </div>
  );

}
