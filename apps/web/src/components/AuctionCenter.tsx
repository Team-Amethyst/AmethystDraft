import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useParams } from "react-router";
import { useLeague } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import type { Player } from "../types/player";
import { addRosterEntry, removeRosterEntry } from "../api/roster";
import type { RosterEntry } from "../api/roster";
import {
  auctionCenterCategoryImpactRows,
  availableSlotsForTeamName,
} from "../pages/commandCenterUtils";
import {
  getValuationPlayer,
  type ValuationResponse,
  type ValuationResult,
} from "../api/engine";
import {
  mergeValuationBoardRowIntoPrevious,
  normalizeValuationResultRow,
} from "../api/valuationNormalize";
import {
  logDevCcValuationPlayerResponseBody,
  logDevValuationPlayerHttpResponse,
  logDevValuationPlayerRequest,
  runDevEngineBoardRowConsistencyCheck,
  runDevMergedValuationPipelineLog,
  runDevValuationRowChangeLog,
} from "../dev/auctionCenterDiagnostics";
import { resolveUserTeamId } from "../utils/team";
import {
  normalizeValuationPlayerId,
  commandCenterWalletCapsFromMyTeam,
} from "../utils/valuation";
import {
  leagueValuationConfigKey,
  rosterValuationFingerprint,
  valuationResultNumbersEqual,
  valuationResultStableKey,
} from "../utils/valuationDeps";
import {
  actionableBidFromRecommendedAndMaxBid,
  cleanedYourValueAndRecommendedBid,
  engineFiniteOrNull,
  formatEdgeLine,
  mergeDisplayValuationRow,
  valueMinusBidDeltaRounded,
  verdictFromValueMinusBid,
} from "../domain/auctionCenterValuation";
import { searchRankedAvailablePlayers } from "../domain/auctionPlayerSearch";
import {
  getEligibleSlotsForPositions,
  hasPitcherEligibility,
} from "../utils/eligibility";
import { DRAFT_SESSION_NOTE_PLAYER_ID } from "../constants/draftNoteIds";
import { AuctionCenterLogResultBar } from "./auction-center/AuctionCenterLogResultBar";
import { AuctionCenterPlayerStack } from "./auction-center/AuctionCenterPlayerStack";
import { AuctionCenterNotesDock } from "./auction-center/AuctionCenterNotesDock";
import { AuctionCenterSearchBar } from "./auction-center/AuctionCenterSearchBar";

interface AuctionCenterProps {
  rosterEntries: RosterEntry[];
  refreshRoster: () => void;
  allPlayers: Player[];
  selectedPlayer: Player | null;
  setSelectedPlayer: (p: Player | null) => void;
  draftedIds: Set<string>;
  myTeamEntries: RosterEntry[];
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  onAddMissingPlayer?: () => void;
  /** Parent-fetched valuation board (same as Command Center engine snapshot; avoids duplicate getValuation). */
  engineMarket?: ValuationResponse | null;
}

export function AuctionCenter({
  rosterEntries,
  refreshRoster,
  allPlayers,
  selectedPlayer,
  setSelectedPlayer,
  draftedIds,
  myTeamEntries,
  showToast,
  onAddMissingPlayer,
  engineMarket = null,
}: AuctionCenterProps) {
  const { id: leagueId } = useParams<{ id: string }>();
  const { league } = useLeague();
  const { token, user } = useAuth();
  const { isInWatchlist } = useWatchlist();
  const { getNote, setNote } = usePlayerNotes();

  const [valuationMap, setValuationMap] = useState<
    Map<string, ValuationResult>
  >(new Map());
  /** True while the active per-player Engine `getValuationPlayer` request is in flight. */
  const [playerEngineFetchPending, setPlayerEngineFetchPending] =
    useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  const [wonBy, setWonBy] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  /** True after user edits bid $; avoids overwriting with late Engine payload. */
  const bidPriceTouchedRef = useRef(false);
  const [draftNotesHeight, setDraftNotesHeight] = useState(180);
  const [draftedToSlot, setDraftedToSlot] = useState("");
  const [statView, setStatView] = useState<"hitting" | "pitching">("pitching");
  const [submitting, setSubmitting] = useState(false);
  const [redoStack, setRedoStack] = useState<RosterEntry[]>([]);

  const onDraftNotesResizeStart = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = draftNotesHeight;
      const onMove = (evt: MouseEvent) => {
        const maxAllowedHeight = Math.max(
          120,
          (contentScrollRef.current?.clientHeight ?? startHeight) - 8,
        );
        const next = Math.max(
          120,
          Math.min(maxAllowedHeight, startHeight + (startY - evt.clientY)),
        );
        setDraftNotesHeight(next);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [draftNotesHeight],
  );

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

  const userTeamId = useMemo(
    () => resolveUserTeamId(league ?? null, user?.id),
    [league?.id, league?.memberIds?.join(","), user?.id],
  );

  const selectedPlayerNormId = useMemo(
    () => (selectedPlayer?.id ? normalizeValuationPlayerId(selectedPlayer.id) : ""),
    [selectedPlayer?.id],
  );

  const selectedPlayerValuationKey = useMemo(() => {
    if (!selectedPlayerNormId) return "";
    const v = valuationMap.get(selectedPlayerNormId);
    if (!v) return `missing:${selectedPlayerNormId}`;
    return valuationResultStableKey(v);
  }, [selectedPlayerNormId, valuationMap]);

  const activeValuationRow = useMemo(() => {
    if (!selectedPlayerNormId) return undefined;
    return valuationMap.get(selectedPlayerNormId);
  }, [selectedPlayerNormId, selectedPlayerValuationKey, valuationMap]);

  const displayValuationRow = useMemo(() => {
    if (!selectedPlayer) return undefined;
    return mergeDisplayValuationRow(activeValuationRow, selectedPlayer);
  }, [activeValuationRow, selectedPlayer]);

  /** Single row for card, bid default, and actionable math (catalog fills engine gaps). */
  const mergedValuationRow = useMemo(
    () => displayValuationRow ?? activeValuationRow ?? undefined,
    [displayValuationRow, activeValuationRow],
  );

  useLayoutEffect(() => {
    if (!leagueId || !token || !selectedPlayer) {
      setPlayerEngineFetchPending(false);
      return;
    }
    setPlayerEngineFetchPending(true);
  }, [
    leagueId,
    token,
    selectedPlayer?.id,
    leagueValuationKey,
    rosterValuationKey,
    userTeamId,
  ]);

  /** Hide merged/catalog numbers until the latest player valuation response lands (avoids flash). */
  const rowForValuationUi =
    playerEngineFetchPending && selectedPlayerNormId
      ? undefined
      : mergedValuationRow;

  const myTeamWalletFingerprint = useMemo(
    () =>
      myTeamEntries
        .map((e) => `${e._id}:${e.price}:${e.rosterSlot ?? ""}`)
        .sort()
        .join("|"),
    [myTeamEntries],
  );

  const myWalletCaps = useMemo(() => {
    if (!league || !user?.id || !league.memberIds.includes(user.id))
      return null;
    return commandCenterWalletCapsFromMyTeam(league, myTeamEntries);
  }, [league, user?.id, myTeamWalletFingerprint]);

  const identityValueVsBidBadge = useMemo(() => {
    if (!selectedPlayer) return null;
    const cleaned = cleanedYourValueAndRecommendedBid(
      rowForValuationUi ?? null,
      selectedPlayer,
    );
    if (!cleaned) return null;
    const delta = valueMinusBidDeltaRounded(cleaned.yourValue, cleaned.bid);
    const v = verdictFromValueMinusBid(delta);
    return {
      deltaText: formatEdgeLine(delta),
      label: v.label,
      tone: v.tone,
    };
  }, [rowForValuationUi, selectedPlayer]);

  const hasBidSignal = Boolean(
    rowForValuationUi &&
      (engineFiniteOrNull(rowForValuationUi.recommended_bid) != null ||
        engineFiniteOrNull(rowForValuationUi.team_adjusted_value) != null),
  );

  useEffect(() => {
    if (!selectedPlayer) return;
    runDevMergedValuationPipelineLog({
      selectedPlayer,
      myWalletCaps,
      activeValuationRow,
      displayValuationRow,
      mergedValuationRow,
      valuationMap,
    });
  }, [
    selectedPlayer,
    activeValuationRow,
    displayValuationRow,
    mergedValuationRow,
    myWalletCaps,
    valuationMap,
  ]);

  // Merge board valuations from Command Center’s single engine snapshot (no duplicate getValuation).
  useEffect(() => {
    if (!engineMarket?.valuations?.length) return;
    setValuationMap((prev) => {
      const next = new Map(prev);
      for (const v of engineMarket.valuations) {
        const id = normalizeValuationPlayerId(v.player_id);
        const boardRow = normalizeValuationResultRow(
          v as unknown as Record<string, unknown>,
        );
        boardRow.player_id = id;
        const prevRow = next.get(id);
        next.set(id, mergeValuationBoardRowIntoPrevious(prevRow, boardRow));
      }
      return next;
    });
  }, [engineMarket]);

  useEffect(() => {
    if (!engineMarket?.valuations?.length || !selectedPlayer) return;
    runDevEngineBoardRowConsistencyCheck({
      engineMarket,
      selectedPlayer,
      valuationMap,
    });
  }, [engineMarket, selectedPlayer, valuationMap, selectedPlayerNormId]);

  // Lighter per-player refresh when the card changes (merges into map; full board still on roster change).
  useEffect(() => {
    if (!leagueId || !token || !selectedPlayer) {
      setPlayerEngineFetchPending(false);
      return;
    }
    const playerIdRaw = selectedPlayer.id;
    const playerId = normalizeValuationPlayerId(playerIdRaw);
    logDevValuationPlayerRequest({
      playerId: playerIdRaw,
      leagueId,
      userTeamId,
    });
    let cancelled = false;
    void getValuationPlayer(leagueId, token, String(playerIdRaw), userTeamId)
      .then((res) => {
        if (cancelled) return;
        const responseRow =
          res.player ??
          (Array.isArray(res.valuations)
            ? res.valuations.find(
                (x) => normalizeValuationPlayerId(x.player_id) === playerId,
              )
            : undefined);
        logDevValuationPlayerHttpResponse({
          playerId: playerIdRaw,
          row: responseRow,
          valuationsLen: Array.isArray(res.valuations) ? res.valuations.length : 0,
        });
        logDevCcValuationPlayerResponseBody({
          playerId: playerIdRaw,
          row: res.player,
          valuationsLen: Array.isArray(res.valuations) ? res.valuations.length : 0,
        });
        let row: ValuationResult | undefined = res.player;
        if (!row && Array.isArray(res.valuations)) {
          row =
            res.valuations.find(
              (x) => normalizeValuationPlayerId(x.player_id) === playerId,
            ) ??
            (res.valuations.length === 1 ? res.valuations[0] : undefined);
        }
        if (row) {
          const normalizedRow: ValuationResult = {
            ...row,
            player_id: playerId,
          };
          setValuationMap((prev) => {
            const cur = prev.get(playerId);
            const mergedRow = mergeValuationBoardRowIntoPrevious(
              cur,
              normalizedRow,
            );
            if (cur && valuationResultNumbersEqual(cur, mergedRow)) return prev;
            const next = new Map(prev);
            next.set(playerId, mergedRow);
            return next;
          });
        }
      })
      .catch(() => {
        /* keep last full-board map; player-only is best-effort */
      })
      .finally(() => {
        if (!cancelled) setPlayerEngineFetchPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    leagueId,
    token,
    userTeamId,
    leagueValuationKey,
    rosterValuationKey,
    selectedPlayer?.id,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Seed "Won By" default when league loads
  useEffect(() => {
    if (!league?.id || wonBy) return;
    setWonBy(league.teamNames[0] ?? "");
  }, [league?.id, league?.teamNames?.join("\u0001"), wonBy]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // When a new player is selected, initialise stat view + bid default (Engine row when present).
  // valuationMap is read intentionally only on player change; a separate effect syncs late Engine payloads.
  useEffect(() => {
    if (!selectedPlayer) return;
    bidPriceTouchedRef.current = false;
    setFinalPrice("");
    const isPitcher = hasPitcherEligibility(
      selectedPlayer.positions,
      selectedPlayer.position,
    );
    setStatView(isPitcher ? "pitching" : "hitting");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when selected player id changes
  }, [selectedPlayer?.id]);

  // When valuations refresh, update bid default from Engine if user has not edited the field
  useEffect(() => {
    if (!selectedPlayer || bidPriceTouchedRef.current) return;
    if (playerEngineFetchPending) return;
    const actionable = actionableBidFromRecommendedAndMaxBid(
      rowForValuationUi ?? undefined,
      myWalletCaps?.maxBid ?? null,
    );
    if (actionable != null) {
      setFinalPrice(String(Math.max(1, Math.round(actionable))));
    }
  }, [
    selectedPlayer?.id,
    selectedPlayer?.value,
    rowForValuationUi,
    myWalletCaps,
    playerEngineFetchPending,
  ]);

  const onFinalPriceChange = useCallback((value: string) => {
    bidPriceTouchedRef.current = true;
    setFinalPrice(value);
  }, []);

  useEffect(() => {
    if (!selectedPlayer?.id) return;
    runDevValuationRowChangeLog({
      selectedPlayerId: selectedPlayer.id,
      selectedPlayerValuationKey,
      valuationMap,
    });
  }, [selectedPlayer?.id, selectedPlayerValuationKey, valuationMap]);

  const dropdownResults = useMemo(
    () =>
      searchRankedAvailablePlayers(allPlayers, draftedIds, searchQuery, {
        limit: 8,
      }),
    [allPlayers, draftedIds, searchQuery],
  );

  const handleSelectPlayer = (player: Player) => {
    setSelectedPlayer(player);
    setSearchQuery("");
    setShowDropdown(false);
  };

  const handleLogResult = async () => {
    if (!selectedPlayer || !leagueId || !token || !league) return;
    const teamIdx = league.teamNames.indexOf(wonBy);
    if (teamIdx === -1) {
      showToast("Team not found in league", "error");
      return;
    }
    const userId = league.memberIds[teamIdx]; // undefined for unjoined teams
    const teamId = `team_${teamIdx + 1}`;
    const price = parseInt(finalPrice, 10) || 1;
    const totalSlots = Object.values(league.rosterSlots).reduce(
      (a, b) => a + b,
      0,
    );
    const teamEntries = rosterEntries.filter((e) => e.teamId === teamId);
    const spent = teamEntries.reduce((s, e) => s + e.price, 0);
    const open = Math.max(0, totalSlots - teamEntries.length);
    const remaining = Math.max(0, league.budget - spent);
    const maxBid = open > 0 ? Math.max(1, remaining - (open - 1)) : 0;
    if (price > maxBid) {
      showToast(`$${price} exceeds ${wonBy}'s max bid of $${maxBid}`, "error");
      return;
    }
    const playerName = selectedPlayer.name;
    setSubmitting(true);
    setSelectedPlayer(null);
    setFinalPrice("");
    try {
      await addRosterEntry(
        leagueId,
        {
          externalPlayerId: selectedPlayer.id,
          playerName: selectedPlayer.name,
          playerTeam: selectedPlayer.team,
          positions: selectedPlayer.positions?.length
            ? selectedPlayer.positions
            : [selectedPlayer.position],
          price,
          rosterSlot: draftedToSlot,
          isKeeper: false,
          userId,
          teamId,
        },
        token,
      );
      setRedoStack([]);
      refreshRoster();
      showToast(
        `✓ ${playerName} drafted to ${draftedToSlot} for $${price}`,
        "success",
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to log result",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndo = async () => {
    if (!leagueId || !token || rosterEntries.length === 0) return;
    const sorted = [...rosterEntries].sort(
      (a, b) =>
        new Date(a.acquiredAt ?? a.createdAt ?? 0).getTime() -
        new Date(b.acquiredAt ?? b.createdAt ?? 0).getTime(),
    );
    const entry = sorted[sorted.length - 1];
    try {
      await removeRosterEntry(leagueId, entry._id, token);
      setRedoStack((prev) => [...prev, entry]);
      refreshRoster();
      showToast(`↩ Undid ${entry.playerName}`, "info");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Undo failed", "error");
    }
  };

  const handleRedo = async () => {
    if (!leagueId || !token || redoStack.length === 0 || !league) return;
    const entry = redoStack[redoStack.length - 1];
    try {
      await addRosterEntry(
        leagueId,
        {
          externalPlayerId: entry.externalPlayerId,
          playerName: entry.playerName,
          playerTeam: entry.playerTeam,
          positions: entry.positions,
          price: entry.price,
          rosterSlot: entry.rosterSlot,
          isKeeper: entry.isKeeper,
          userId: entry.userId,
          teamId: entry.teamId,
        },
        token,
      );
      setRedoStack((prev) => prev.slice(0, -1));
      refreshRoster();
      showToast(`↪ Redid ${entry.playerName}`, "info");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Redo failed", "error");
    }
  };

  const catImpactRows = useMemo(
    () =>
      auctionCenterCategoryImpactRows({
        selectedPlayer,
        scoringCategories: league?.scoringCategories,
        statView,
        myTeamEntries,
        allPlayers,
      }),
    [
      selectedPlayer,
      league?.scoringCategories,
      statView,
      myTeamEntries,
      allPlayers,
    ],
  );

  const teamNames = league?.teamNames ?? [];
  const allSlotOptions = league?.rosterSlots
    ? Object.keys(league.rosterSlots)
    : ["SP", "RP", "C", "1B", "2B", "SS", "3B", "OF", "UTIL", "BN"];

  const eligible = selectedPlayer
    ? getEligibleSlotsForPositions(
        selectedPlayer.positions,
        allSlotOptions,
        selectedPlayer.position,
      )
    : allSlotOptions;
  const available = availableSlotsForTeamName(
    league,
    wonBy,
    allSlotOptions,
    rosterEntries,
  );
  const eligibleSlotOptions = eligible.filter((s) => available.has(s));
  const overrideSlotOptions = allSlotOptions.filter((s) => available.has(s));
  const hittingCats = (league?.scoringCategories ?? []).filter(
    (c) => c.type === "batting",
  );
  const pitchingCats = (league?.scoringCategories ?? []).filter(
    (c) => c.type === "pitching",
  );

  // Auto-correct draftedToSlot when player or team changes
  useEffect(() => {
    if (
      overrideSlotOptions.length > 0 &&
      !overrideSlotOptions.includes(draftedToSlot)
    ) {
      setDraftedToSlot(
        eligibleSlotOptions[0] ?? overrideSlotOptions[0],
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlayer?.id, wonBy]);

  return (
    <div className="cc-center">
      <AuctionCenterSearchBar
        searchRef={searchRef}
        searchInputRef={searchInputRef}
        searchQuery={searchQuery}
        onSearchChange={(v) => {
          setSearchQuery(v);
          setShowDropdown(v.length >= 1);
        }}
        onSearchFocus={() => {
          if (searchQuery.length >= 1) setShowDropdown(true);
        }}
        selectedPlayer={selectedPlayer}
        onClearSelection={() => {
          setSelectedPlayer(null);
          setSearchQuery("");
        }}
        canUndo={rosterEntries.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        showDropdown={showDropdown}
        dropdownResults={dropdownResults}
        onSelectPlayer={handleSelectPlayer}
        isInWatchlist={isInWatchlist}
        onAddMissingPlayer={onAddMissingPlayer}
        onDismissDropdown={() => setShowDropdown(false)}
      />

      <div ref={contentScrollRef} className="cc-content-scroll">
        <div className="player-auction-card command-center-main">
          {!selectedPlayer ? (
            <div className="cc-empty-state">
              <div className="cc-empty-icon">⊕</div>
              <div className="cc-empty-title">No player loaded</div>
              <div className="cc-empty-sub">
                Search for a player above to begin the auction
              </div>
            </div>
          ) : (
            <>
            <div className="pac-cards-stack">
              <AuctionCenterPlayerStack
                selectedPlayer={selectedPlayer}
                mergedValuationRow={mergedValuationRow}
                rowForValuationUi={rowForValuationUi}
                identityValueVsBidBadge={identityValueVsBidBadge}
                getNote={getNote}
                setNote={setNote}
                isInWatchlist={isInWatchlist}
                statView={statView}
                onStatViewChange={setStatView}
                catImpactRows={catImpactRows}
                pitchingCats={pitchingCats}
                hittingCats={hittingCats}
              />
            </div>

            <AuctionCenterLogResultBar
              teamNames={teamNames}
              wonBy={wonBy}
              onWonByChange={setWonBy}
              finalPrice={finalPrice}
              onFinalPriceChange={onFinalPriceChange}
              draftedToSlot={draftedToSlot}
              onDraftedToSlotChange={setDraftedToSlot}
              overrideSlotOptions={overrideSlotOptions}
              eligibleSlotOptions={eligibleSlotOptions}
              selectedPlayer={selectedPlayer}
              submitting={submitting}
              hasBidSignal={hasBidSignal}
              onLog={handleLogResult}
            />
            </div>
            </>
          )}
        </div>

        <AuctionCenterNotesDock
          heightPx={draftNotesHeight}
          onResizeStart={onDraftNotesResizeStart}
          noteValue={getNote(DRAFT_SESSION_NOTE_PLAYER_ID) ?? ""}
          onNoteChange={(value) =>
            setNote(DRAFT_SESSION_NOTE_PLAYER_ID, value)
          }
        />
      </div>
    </div>
  );
}
