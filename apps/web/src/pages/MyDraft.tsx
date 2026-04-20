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

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { usePageTitle } from "../hooks/usePageTitle";
import { useLeague } from "../contexts/LeagueContext";
import { useAuth } from "../contexts/AuthContext";
import { useWatchlist } from "../contexts/WatchlistContext";
import { usePlayerNotes } from "../contexts/PlayerNotesContext";
import { useSelectedPlayer } from "../contexts/SelectedPlayerContext";
import type { WatchlistPlayer } from "../api/watchlist";
import type { Player } from "../types/player";
import { getCatalogBatchValues } from "../api/engine";
import AllocationBar from "../components/MyDraft/AllocationBar";
import PositionTargets, {
  type PositionPlanRow,
} from "../components/MyDraft/PositionTargets";
import WatchlistTable from "../components/MyDraft/WatchlistTable";
import DraftNotes from "../components/MyDraft/DraftNotes";
import { hasPitcherEligibility } from "../utils/eligibility";
import { getEffectiveTierValue } from "../utils/effectiveTierValue";
import "./MyDraft.css";

// ─── Constants ────────────────────────────────────────────────────────────────

// TODO(data): Replace with backend-provided roster template + budget targets per position.
const POSITION_PLAN: PositionPlanRow[] = [
  { pos: "C",    slots: 1, target: 14 },
  { pos: "1B",   slots: 1, target: 28 },
  { pos: "2B",   slots: 1, target: 22 },
  { pos: "SS",   slots: 1, target: 25 },
  { pos: "3B",   slots: 1, target: 24 },
  { pos: "OF",   slots: 3, target: 44 },
  { pos: "SP",   slots: 2, target: 60 },
  { pos: "RP",   slots: 2, target: 20 },
  { pos: "UTIL", slots: 1, target: 15 },
  { pos: "BN",   slots: 4, target: 8  },
];

const POS_COLORS: Record<string, string> = {
  C:    "#f87171",
  "1B": "#fbbf24",
  "2B": "#38bdf8",
  "3B": "#fb923c",
  SS:   "#22d3ee",
  OF:   "#4ade80",
  SP:   "#818cf8",
  RP:   "#f472b6",
  UTIL: "#94a3b8",
  BN:   "#6b7280",
};

type ViewFilter = "all" | "hitters" | "pitchers";
type Priority = "High" | "Medium" | "Low";

function watchlistToPlayer(p: WatchlistPlayer): Player {
  return {
    id: p.id,
    mlbId: 0,
    name: p.name,
    team: p.team,
    position: p.position,
    positions: p.positions,
    age: 0,
    adp: p.adp,
    value: p.value,
    tier: p.tier,
    headshot: "",
    outlook: "",
    stats: {},
    projection: {},
  };
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MyDraft() {
  usePageTitle("My Draft");

  const { id: leagueId } = useParams<{ id: string }>();
  const { league } = useLeague();
  const { token } = useAuth();
  const totalBudget = league?.budget ?? 260;
  const navigate = useNavigate();

  const { setSelectedPlayer } = useSelectedPlayer();
  const { watchlist, removeFromWatchlist } = useWatchlist();
  const { getNote, setNote } = usePlayerNotes();

  // ── UI state ────────────────────────────────────────────────────────────────
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");

  // ── Persisted overrides ─────────────────────────────────────────────────────
  const defaultPositionTargets = Object.fromEntries(
    POSITION_PLAN.map((r) => [r.pos, r.target]),
  );

  const [positionTargets, setPositionTargets] = useState<Record<string, number>>(
    () => ({
      ...defaultPositionTargets,
      ...loadFromStorage<Record<string, number>>("amethyst-position-targets", {}),
    }),
  );

  const [targetOverrides, setTargetOverrides] = useState<Record<string, number>>(
    () => loadFromStorage("amethyst-target-overrides", {}),
  );

  const [priorityOverrides, setPriorityOverrides] = useState<Record<string, Priority>>(
    () => loadFromStorage("amethyst-priority-overrides", {}),
  );

  // Raw string state for controlled inputs — committed on blur
  const [targetRaw, setTargetRaw] = useState<Record<string, string>>({});
  const [engineCatalogByPlayerId, setEngineCatalogByPlayerId] = useState<
    ReadonlyMap<string, { value: number; tier: number }>
  >(() => new Map());
  useEffect(() => {
    if (!token || watchlist.length === 0) {
      const clear = window.setTimeout(() => setEngineCatalogByPlayerId(new Map()), 0);
      return () => window.clearTimeout(clear);
    }
    if (!league) {
      const clear = window.setTimeout(() => setEngineCatalogByPlayerId(new Map()), 0);
      return () => window.clearTimeout(clear);
    }
    const ids = watchlist.map((p) => p.id);
    const BATCH = 150;
    const pool = league.playerPool ?? "Mixed";
    let cancelled = false;
    void (async () => {
      const merged = new Map<string, { value: number; tier: number }>();
      let batchFailed = false;
      for (let i = 0; i < ids.length; i += BATCH) {
        if (cancelled) return;
        try {
          const res = await getCatalogBatchValues(token, {
            player_ids: ids.slice(i, i + BATCH),
            league_scope: pool,
            pos_eligibility_threshold: league?.posEligibilityThreshold,
          });
          for (const row of res.players) {
            merged.set(row.player_id, { value: row.value, tier: row.tier });
          }
        } catch {
          batchFailed = true;
          break;
        }
      }
      if (!cancelled && !batchFailed) setEngineCatalogByPlayerId(merged);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    token,
    watchlist,
    league,
    league?.playerPool,
    league?.posEligibilityThreshold,
  ]);

  const effectiveWatchlist = useMemo(
    () =>
      watchlist.map((p) => {
        const eff = getEffectiveTierValue(
          p.id,
          { tier: p.tier, value: p.value },
          engineCatalogByPlayerId,
        );
        return { ...p, tier: eff.tier, value: eff.value };
      }),
    [watchlist, engineCatalogByPlayerId],
  );


  // ── Position target handlers ────────────────────────────────────────────────

  function handlePositionTargetChange(pos: string, raw: string, value: number | null) {
    setTargetRaw((r) => ({ ...r, [pos]: raw }));
    if (value !== null) {
      setPositionTargets((prev) => {
        const next = { ...prev, [pos]: value };
        saveToStorage("amethyst-position-targets", next);
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
        saveToStorage("amethyst-position-targets", next);
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
    localStorage.removeItem("amethyst-position-targets");
  }

  // ── Watchlist target handlers ───────────────────────────────────────────────

  function handleWatchlistTargetChange(playerId: string, raw: string, value: number | null) {
    setTargetRaw((r) => ({ ...r, [playerId]: raw }));
    if (value !== null) {
      setTargetOverrides((prev) => {
        const next = { ...prev, [playerId]: value };
        saveToStorage("amethyst-target-overrides", next);
        return next;
      });
    }
  }

  function handleWatchlistTargetBlur(playerId: string, displayVal: string, defaultTarget: number) {
    const v = parseInt(displayVal);
    const committed = isNaN(v) || v <= 0 ? defaultTarget : v;
    setTargetOverrides((prev) => {
      const next = { ...prev, [playerId]: committed };
      saveToStorage("amethyst-target-overrides", next);
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
      saveToStorage("amethyst-target-overrides", updated);
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
      saveToStorage("amethyst-priority-overrides", next);
      return next;
    });
  }

  // ── Navigation handler ──────────────────────────────────────────────────────

  function handleWatchlistRowClick(playerId: string) {
    const player = effectiveWatchlist.find((p) => p.id === playerId);
    if (player) {
      setSelectedPlayer(watchlistToPlayer(player));
      void navigate(`/leagues/${leagueId}/command-center`);
    }
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  const { watchlistTargetTotal, filteredWatchlist } = useMemo(() => {
    let targetTotal = 0;
    for (const player of effectiveWatchlist) {
      targetTotal += targetOverrides[player.id] ?? Math.round(player.value ?? 0);
    }

    let filtered = [...effectiveWatchlist];
    if (viewFilter === "hitters") {
      filtered = filtered.filter(
        (p) => !hasPitcherEligibility(p.positions, p.position || "UTIL"),
      );
    } else if (viewFilter === "pitchers") {
      filtered = filtered.filter((p) =>
        hasPitcherEligibility(p.positions, p.position || "UTIL"),
      );
    }
    filtered.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    return { watchlistTargetTotal: targetTotal, filteredWatchlist: filtered };
  }, [effectiveWatchlist, viewFilter, targetOverrides]);

  const positionBudgetTotal = Object.values(positionTargets).reduce(
    (a, b) => a + b,
    0,
  );
  const positionBuffer = Math.max(0, totalBudget - positionBudgetTotal);

  const allocBarSegments = POSITION_PLAN.map((row) => ({
    pos: row.pos,
    slots: row.slots,
    target: positionTargets[row.pos] ?? row.target,
    color: POS_COLORS[row.pos] ?? "#7f72a8",
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
            targetOverrides={targetOverrides}
            targetRaw={targetRaw}
            priorityOverrides={priorityOverrides}
            getNote={getNote}
            onViewFilterChange={setViewFilter}
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
          value={getNote("__draft__")}
          onChange={(val) => setNote("__draft__", val)}
        />

      </main>
    </div>
  );
}