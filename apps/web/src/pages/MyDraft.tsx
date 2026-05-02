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

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";
import { useLeague } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import { getValuation } from "../api/engine";
import AllocationBar from "../components/MyDraft/AllocationBar";
import PositionTargets from "../components/MyDraft/PositionTargets";
import {
  POSITION_ALLOCATION_PLAN,
} from "../constants/positionAllocationPlan";
import { positionColorStyle } from "../constants/positionColors";
import WatchlistTable from "../components/MyDraft/WatchlistTable";
import DraftNotes from "../components/MyDraft/DraftNotes";
import { type ValuationShape, type ValuationSortField } from "../utils/valuation";
import { resolveUserTeamId } from "../utils/team";
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

  const { setSelectedPlayer } = useSelectedPlayer();
  const { watchlist, removeFromWatchlist } = useWatchlist();
  const { getNote, setNote } = usePlayerNotes();

  // ── UI state ────────────────────────────────────────────────────────────────
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [valuationSortField, setValuationSortField] =
    useState<ValuationSortField>("team_adjusted_value");

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

  // Raw string state for controlled inputs — committed on blur
  const [targetRaw, setTargetRaw] = useState<Record<string, string>>({});
  const [valuationsByPlayerId, setValuationsByPlayerId] = useState<
    ReadonlyMap<string, ValuationShape>
  >(() => new Map());

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
        "team_adjusted_value",
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
    if (!token || !leagueId || watchlist.length === 0) {
      const clear = window.setTimeout(() => setValuationsByPlayerId(new Map()), 0);
      return () => window.clearTimeout(clear);
    }
    let cancelled = false;
    void (async () => {
      try {
        const userTeamId = resolveUserTeamId(league, user?.id);
        const res = await getValuation(leagueId, token, userTeamId);
        const merged = new Map<string, ValuationShape>();
        for (const row of res.valuations) merged.set(row.player_id, row);
        if (!cancelled) setValuationsByPlayerId(merged);
      } catch {
        if (!cancelled) setValuationsByPlayerId(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    token,
    watchlist,
    leagueId,
    league,
    user?.id,
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