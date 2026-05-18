/**
 * MyDraft (container)
 *
 * Manages shared state and coordinates interactions between subcomponents.
 * Does not render any UI directly — delegates all display to:
 *   - <AllocationBar />   — visual budget split bar
 *   - <PositionTargets /> — editable position allocation table
 *   - <WatchlistTable />  — strategic watchlist with notes/priority/targets
 *   - <DraftNotes />      — resizable freeform notes textarea
 *
 * Design Pattern: Observer — acts as the central subject that holds state
 *   (positionTargets, targetOverrides, priorityOverrides) and pushes updates
 *   down to observer subcomponents via props.
 * Design Principle: Single Responsibility — only responsible for state
 *   management and cross-component coordination; all rendering is delegated.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";
import { useLeague } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { getValuation, type ValuationResponse } from "../api/engine";
import {
  buildValuationBoardCacheKey,
  peekBoardValuationCache,
} from "../api/valuationCache";
import {
  classifyBoardValuationFetchPhase,
  type BoardValuationUiPhase,
} from "../domain/boardValuationFetchPhase";
import {
  filterValuationAlertsForSurface,
  normalizeValuationAlerts,
} from "../domain/valuationAlerts";
import { useValuationBoardAlerts } from "../contexts/ValuationBoardAlertsContext";
import AllocationBar from "../components/MyDraft/AllocationBar";
import PositionTargets from "../components/MyDraft/PositionTargets";
import {
  POSITION_ALLOCATION_PLAN,
} from "../constants/positionAllocationPlan";
import { positionColorStyle } from "../constants/positionColors";
import WatchlistTable from "../components/MyDraft/WatchlistTable";
import DraftNotes from "../components/MyDraft/DraftNotes";
import {
  defaultValuationSortForPage,
  type ValuationShape,
  type ValuationSortField,
} from "../utils/valuation";
import { resolveUserTeamId } from "../utils/team";
import {
  leagueValuationConfigKey,
  rosterValuationFingerprint,
} from "../utils/valuationDeps";
import { getRoster, getRosterCached, type RosterEntry } from "../api/roster";
import {
  readPositionTargetsFromStorage,
  writePositionTargetsToStorage,
  clearPositionTargetsStorage,
} from "../utils/positionTargetsStorage";
import {
  loadJsonFromStorage,
  myDraftLeagueKey,
  saveJsonToStorage,
} from "../utils/myDraftStateStorage";
import { DRAFT_SESSION_NOTE_PLAYER_ID } from "../constants/draftNoteIds";
import { useMyDraftWatchlistDerived } from "../hooks/useMyDraftWatchlistDerived";
import { playerFromWatchlistEntry } from "../domain/watchlistToPlayer";
import "./MyDraft.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const POSITION_PLAN = POSITION_ALLOCATION_PLAN;

type ViewFilter = "all" | "hitters" | "pitchers";
type Priority = "High" | "Medium" | "Low";

// ─── Component ────────────────────────────────────────────────────────────────

export default function MyDraft() {
  usePageTitle("My Draft");

  const { id: leagueId } = useParams<{ id: string }>();
  const { league } = useLeague();
  const { token, user } = useAuth();
  const totalBudget = league?.budget ?? 260;
  const navigate = useNavigate();

  const watchlistDraftSlotKeys = useMemo(
    () => (league?.rosterSlots ? Object.keys(league.rosterSlots) : undefined),
    [league?.rosterSlots],
  );

  const { setSelectedPlayer } = useSelectedPlayer();
  const { watchlist, removeFromWatchlist } = useWatchlist();
  const { getNote, setNote } = usePlayerNotes();

  // ── UI state ────────────────────────────────────────────────────────────────
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [valuationSortField, setValuationSortField] = useState<ValuationSortField>(
    () => defaultValuationSortForPage("MyDraft"),
  );

  // ── Persisted overrides ─────────────────────────────────────────────────────
  const defaultPositionTargets = Object.fromEntries(
    POSITION_PLAN.map((r) => [r.pos, r.target]),
  );

  const [positionTargets, setPositionTargets] = useState<Record<string, number>>(
    () => ({
      ...defaultPositionTargets,
      ...readPositionTargetsFromStorage(leagueId),
    }),
  );
  useEffect(() => {
    setPositionTargets({
      ...defaultPositionTargets,
      ...readPositionTargetsFromStorage(leagueId),
    });
  }, [leagueId]);


  const [targetOverrides, setTargetOverrides] = useState<Record<string, number>>(
    () => loadJsonFromStorage(myDraftLeagueKey(leagueId, "target-overrides"), {}),
  );

  const [priorityOverrides, setPriorityOverrides] = useState<
    Record<string, Priority>
  >(() => loadJsonFromStorage(myDraftLeagueKey(leagueId, "priority-overrides"), {}));

  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>(
    () => getRosterCached(leagueId ?? "") ?? [],
  );

  const leagueValuationKey = useMemo(
    () => leagueValuationConfigKey(league ?? null),
    [
      league?.id,
      league?.name,
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

  const rosterValuationKey = useMemo(
    () => rosterValuationFingerprint(rosterEntries),
    [rosterEntries],
  );

  const watchlistBoardRequestKey = useMemo(() => {
    if (watchlist.length === 0) return "";
    return watchlist
      .map((w) => w.id)
      .sort()
      .join("\u0001");
  }, [watchlist]);

  useEffect(() => {
    if (!leagueId || !token) return;
    void getRoster(leagueId, token).then(setRosterEntries).catch(() => {
      /* non-fatal */
    });
  }, [leagueId, token]);

  // Raw string state for controlled inputs — committed on blur
  const [targetRaw, setTargetRaw] = useState<Record<string, string>>({});
  const [valuationsByPlayerId, setValuationsByPlayerId] = useState<
    ReadonlyMap<string, ValuationShape>
  >(() => new Map());
  const [lastMyDraftBoardValuation, setLastMyDraftBoardValuation] =
    useState<ValuationResponse | null>(null);
  const [myDraftBoardPhase, setMyDraftBoardPhase] =
    useState<BoardValuationUiPhase>("idle");
  const [myDraftBoardError, setMyDraftBoardError] = useState<string | null>(
    null,
  );
  const myDraftBoardSuccessKeyRef = useRef<string | null>(null);
  const lastMyDraftBoardRef = useRef<ValuationResponse | null>(null);

  useEffect(() => {
    lastMyDraftBoardRef.current = lastMyDraftBoardValuation;
  }, [lastMyDraftBoardValuation]);

  const myDraftValuationAlerts = useMemo(
    () =>
      filterValuationAlertsForSurface(
        normalizeValuationAlerts(lastMyDraftBoardValuation),
        "my-draft",
      ),
    [lastMyDraftBoardValuation],
  );

  const { publishBoardValuationAlerts } = useValuationBoardAlerts();
  useEffect(() => {
    publishBoardValuationAlerts(myDraftValuationAlerts);
  }, [myDraftValuationAlerts, publishBoardValuationAlerts]);
  useEffect(() => {
    return () => {
      publishBoardValuationAlerts([]);
    };
  }, [publishBoardValuationAlerts]);

  useEffect(() => {
    setTargetOverrides(
      loadJsonFromStorage(myDraftLeagueKey(leagueId, "target-overrides"), {}),
    );
    setPriorityOverrides(
      loadJsonFromStorage(myDraftLeagueKey(leagueId, "priority-overrides"), {}),
    );
    setViewFilter(
      loadJsonFromStorage<ViewFilter>(myDraftLeagueKey(leagueId, "view-filter"), "all"),
    );
    setValuationSortField(
      loadJsonFromStorage<ValuationSortField>(
        myDraftLeagueKey(leagueId, "valuation-sort"),
        defaultValuationSortForPage("MyDraft"),
      ),
    );
  }, [leagueId]);

  useEffect(() => {
    saveJsonToStorage(myDraftLeagueKey(leagueId, "target-overrides"), targetOverrides);
  }, [leagueId, targetOverrides]);

  useEffect(() => {
    saveJsonToStorage(
      myDraftLeagueKey(leagueId, "priority-overrides"),
      priorityOverrides,
    );
  }, [leagueId, priorityOverrides]);

  useEffect(() => {
    saveJsonToStorage(myDraftLeagueKey(leagueId, "view-filter"), viewFilter);
  }, [leagueId, viewFilter]);

  useEffect(() => {
    saveJsonToStorage(
      myDraftLeagueKey(leagueId, "valuation-sort"),
      valuationSortField,
    );
  }, [leagueId, valuationSortField]);
  useEffect(() => {
    // Wait for league from layout context: `leagueValuationConfigKey(null)` is "" and
    // `resolveUserTeamId` falls back to `team_1`, then a duplicate POST fires when league loads.
    const canFetch = Boolean(
      token && leagueId && watchlist.length > 0 && leagueValuationKey,
    );
    if (!canFetch) {
      const t = window.setTimeout(() => {
        setValuationsByPlayerId(new Map());
        setLastMyDraftBoardValuation(null);
        setMyDraftBoardPhase("idle");
        setMyDraftBoardError(null);
        myDraftBoardSuccessKeyRef.current = null;
      }, 0);
      return () => window.clearTimeout(t);
    }

    const userTeamId = resolveUserTeamId(league, user?.id);
    const cacheCtx = {
      leagueConfigKey: leagueValuationKey,
      rosterFingerprint: rosterValuationKey,
    };
    const activeCacheKey = buildValuationBoardCacheKey(
      leagueId!,
      userTeamId,
      cacheCtx,
    );
    const peek = peekBoardValuationCache(leagueId!, userTeamId, cacheCtx);
    const pre = classifyBoardValuationFetchPhase({
      canStartFetch: true,
      peekHit: peek !== undefined,
      activeCacheKey,
      lastSuccessCacheKey: myDraftBoardSuccessKeyRef.current,
      displayedBoardPresent: lastMyDraftBoardRef.current !== null,
    });

    if (pre === "ready_sync") {
      setMyDraftBoardPhase("ready");
      setMyDraftBoardError(null);
    } else if (pre === "refreshing") {
      setMyDraftBoardPhase("refreshing");
      setMyDraftBoardError(null);
    } else {
      setMyDraftBoardPhase("loading");
      setMyDraftBoardError(null);
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await getValuation(leagueId!, token!, userTeamId, null, {
          leagueConfigKey: leagueValuationKey,
          rosterFingerprint: rosterValuationKey,
        });
        const merged = new Map<string, ValuationShape>();
        for (const row of res.valuations) merged.set(row.player_id, row);
        if (!cancelled) {
          myDraftBoardSuccessKeyRef.current = activeCacheKey;
          setValuationsByPlayerId(merged);
          setLastMyDraftBoardValuation(res);
          setMyDraftBoardPhase("ready");
          setMyDraftBoardError(null);
        }
      } catch {
        if (!cancelled) {
          setMyDraftBoardPhase("error");
          setMyDraftBoardError("Unable to load watchlist valuations.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    token,
    watchlistBoardRequestKey,
    leagueId,
    user?.id,
    rosterValuationKey,
    leagueValuationKey,
  ]);

  const { effectiveWatchlist, watchlistTargetTotal, filteredWatchlist } =
    useMyDraftWatchlistDerived(
      watchlist,
      valuationsByPlayerId,
      viewFilter,
      targetOverrides,
      valuationSortField,
    );

  // ── Position target handlers ────────────────────────────────────────────────

  function handlePositionTargetChange(pos: string, raw: string, value: number | null) {
    setTargetRaw((r) => ({ ...r, [pos]: raw }));
    if (value !== null) {
      setPositionTargets((prev) => {
        const next = { ...prev, [pos]: value };
        writePositionTargetsToStorage(leagueId, next);
        return next;
      });
    }
  }

  function handlePositionTargetBlur(pos: string) {
    const raw = targetRaw[pos];
    const v = parseInt(raw ?? "");
    if (isNaN(v) || v < 0) {
      setPositionTargets((prev) => {
        const next = { ...prev, [pos]: 0 };
        writePositionTargetsToStorage(leagueId, next);
        return next;
      });
    }
    setTargetRaw((r) => {
      const next = { ...r };
      delete next[pos];
      return next;
    });
  }

  function handleResetPositionTargets() {
    setPositionTargets(defaultPositionTargets);
    clearPositionTargetsStorage(leagueId);
  }

  // ── Watchlist target handlers ───────────────────────────────────────────────

  function handleWatchlistTargetChange(playerId: string, raw: string, value: number | null) {
    setTargetRaw((r) => ({ ...r, [playerId]: raw }));
    if (value !== null) {
      setTargetOverrides((prev) => {
        const next = { ...prev, [playerId]: value };
        return next;
      });
    }
  }

  function handleWatchlistTargetBlur(playerId: string, displayVal: string, defaultTarget: number) {
    const v = parseInt(displayVal);
    const committed = isNaN(v) || v <= 0 ? defaultTarget : v;
    setTargetOverrides((prev) => {
      const next = { ...prev, [playerId]: committed };
      return next;
    });
    setTargetRaw((r) => {
      const next = { ...r };
      delete next[playerId];
      return next;
    });
  }

  function handleWatchlistTargetStep(playerId: string, delta: 1 | -1, current: number) {
    const next = Math.max(1, current + delta);
    setTargetOverrides((prev) => {
      const updated = { ...prev, [playerId]: next };
      return updated;
    });
    setTargetRaw((r) => {
      const next2 = { ...r };
      delete next2[playerId];
      return next2;
    });
  }

  // ── Priority handler ────────────────────────────────────────────────────────

  function handlePriorityChange(playerId: string, priority: Priority) {
    setPriorityOverrides((prev) => {
      const next = { ...prev, [playerId]: priority };
      return next;
    });
  }

  // ── Navigation handler ──────────────────────────────────────────────────────

  function handleWatchlistRowClick(playerId: string) {
    const player = effectiveWatchlist.find((p) => p.id === playerId);
    if (player) {
      setSelectedPlayer(playerFromWatchlistEntry(player));
      void navigate(`/leagues/${leagueId}/command-center`);
    }
  }

  const positionBudgetTotal = Object.values(positionTargets).reduce(
    (a, b) => a + b,
    0,
  );
  const positionBuffer = Math.max(0, totalBudget - positionBudgetTotal);

  const allocBarSegments = POSITION_PLAN.map((row) => ({
    pos: row.pos,
    slots: row.slots,
    target: positionTargets[row.pos] ?? row.target,
    color: positionColorStyle(row.pos).color,
    pct: ((positionTargets[row.pos] ?? row.target) / totalBudget) * 100,
  }));

  const bufferPct = (positionBuffer / totalBudget) * 100;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mydraft-page">
      <main className="mydraft-shell">
        {/* ── Top summary strip ── */}
        <section className="mydraft-top panel-card">
          <div className="top-budget">
            <div className="card-label">Total Budget</div>
            <div className="budget-value">${totalBudget}</div>
          </div>

          <AllocationBar
            segments={allocBarSegments}
            bufferPct={bufferPct}
            bufferAmount={positionBuffer}
          />

          <div className="top-summary">
            <div className="card-label">Planning Summary</div>
            <div className="summary-row">
              <span>Position plan</span>
              <strong>${positionBudgetTotal}</strong>
            </div>
            <div className="summary-row">
              <span>Plan buffer</span>
              <strong className={positionBuffer < 1 ? "summary-warn" : ""}>
                ${positionBuffer}
              </strong>
            </div>
            <div className="summary-row">
              <span>Watchlist targets</span>
              <strong>${watchlistTargetTotal}</strong>
            </div>
          </div>
        </section>

        {/* ── Main two-column grid ── */}
        <section className="mydraft-main-grid">
          <PositionTargets
            positionPlan={POSITION_PLAN}
            positionTargets={positionTargets}
            targetRaw={targetRaw}
            positionBudgetTotal={positionBudgetTotal}
            positionBuffer={positionBuffer}
            onTargetChange={handlePositionTargetChange}
            onTargetBlur={handlePositionTargetBlur}
            onReset={handleResetPositionTargets}
          />

          <WatchlistTable
            watchlist={effectiveWatchlist}
            filteredWatchlist={filteredWatchlist}
            viewFilter={viewFilter}
            valuationSortField={valuationSortField}
            targetOverrides={targetOverrides}
            targetRaw={targetRaw}
            priorityOverrides={priorityOverrides}
            getNote={getNote}
            onViewFilterChange={setViewFilter}
            onValuationSortFieldChange={setValuationSortField}
            onTargetChange={handleWatchlistTargetChange}
            onTargetBlur={handleWatchlistTargetBlur}
            onTargetStep={handleWatchlistTargetStep}
            onPriorityChange={handlePriorityChange}
            onNoteChange={setNote}
            onRemove={removeFromWatchlist}
            onRowClick={handleWatchlistRowClick}
            valuationBoardPhase={myDraftBoardPhase}
            valuationBoardError={myDraftBoardError}
            draftDisplaySlotKeys={watchlistDraftSlotKeys}
          />
        </section>

        {/* ── Notes strip ── */}
        <DraftNotes
          value={getNote(DRAFT_SESSION_NOTE_PLAYER_ID)}
          onChange={(val) => setNote(DRAFT_SESSION_NOTE_PLAYER_ID, val)}
        />

      </main>
    </div>
  );
}